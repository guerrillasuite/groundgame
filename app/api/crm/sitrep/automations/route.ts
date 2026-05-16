import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeAdminSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } },
  );
}

// GET /api/crm/sitrep/automations
export async function GET(_req: NextRequest) {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeAdminSb(tenant.id);
  const { data, error } = await sb
    .from("sitrep_automations")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/crm/sitrep/automations
export async function POST(req: NextRequest) {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.trigger_type || !body?.action_type) {
    return NextResponse.json(
      { error: "name, trigger_type, and action_type are required" },
      { status: 400 },
    );
  }

  const sb = makeAdminSb(tenant.id);
  const { data, error } = await sb
    .from("sitrep_automations")
    .insert({
      tenant_id:      tenant.id,
      name:           body.name.trim(),
      trigger_type:   body.trigger_type,
      trigger_config: body.trigger_config ?? {},
      conditions:     body.conditions     ?? [],
      action_type:    body.action_type,
      action_config:  body.action_config  ?? {},
      is_active:      body.is_active      ?? true,
      created_by:     crmUser.userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
