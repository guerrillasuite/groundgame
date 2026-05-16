import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeAdminSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } },
  );
}

// GET /api/crm/sitrep/automations/[id]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeAdminSb(tenant.id);
  const { data, error } = await sb
    .from("sitrep_automations")
    .select("*, sitrep_automation_runs(id, status, created_at, error_msg)")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false, referencedTable: "sitrep_automation_runs" })
    .limit(20, { referencedTable: "sitrep_automation_runs" })
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/crm/sitrep/automations/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const allowed = [
    "name", "trigger_type", "trigger_config", "conditions",
    "action_type", "action_config", "is_active",
  ];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const sb = makeAdminSb(tenant.id);
  const { data, error } = await sb
    .from("sitrep_automations")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/crm/sitrep/automations/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeAdminSb(tenant.id);
  const { error } = await sb
    .from("sitrep_automations")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
