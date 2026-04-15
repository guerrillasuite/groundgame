import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function GET() {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("email_templates")
    .select("id, name, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, design_json, html_body } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!design_json)   return NextResponse.json({ error: "Design is required" }, { status: 400 });

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("email_templates")
    .insert({ tenant_id: tenant.id, name: name.trim(), design_json, html_body: html_body ?? "" })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
