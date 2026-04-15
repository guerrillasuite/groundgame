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

type Params = { params: Promise<{ id: string }> };

/** GET a single template (design_json + html_body) to load into the editor */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("email_templates")
    .select("id, name, design_json, html_body")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("email_templates")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
