import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { DEFAULT_ADMIN_KPIS } from "@/app/crm/_sections/_helpers";

export const dynamic = "force-dynamic";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET() {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb();
  const { data } = await sb
    .from("user_dashboard_prefs")
    .select("admin_kpi_ids")
    .eq("user_id", crmUser.userId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const kpiIds: string[] = (data as any)?.admin_kpi_ids?.length
    ? (data as any).admin_kpi_ids
    : DEFAULT_ADMIN_KPIS;

  return NextResponse.json({ admin_kpi_ids: kpiIds });
}

export async function PATCH(req: NextRequest) {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { admin_kpi_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.admin_kpi_ids) || body.admin_kpi_ids.length === 0) {
    return NextResponse.json({ error: "admin_kpi_ids must be a non-empty array" }, { status: 400 });
  }

  const ids = body.admin_kpi_ids.slice(0, 5);
  const sb = makeSb();

  const { error } = await sb
    .from("user_dashboard_prefs")
    .upsert({ user_id: crmUser.userId, tenant_id: tenant.id, admin_kpi_ids: ids });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ admin_kpi_ids: ids });
}
