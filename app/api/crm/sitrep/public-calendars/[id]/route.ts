import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const allowed = ["name","include_type_slugs","include_statuses","show_day","show_week","show_month","default_view"];
  const updates: Record<string, any> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }
  updates.updated_at = new Date().toISOString();

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("sitrep_public_calendars")
    .update(updates)
    .eq("id", params.id)
    .eq("tenant_id", tenant.id)
    .select("id, name, token, include_type_slugs, include_statuses, show_day, show_week, show_month, default_view")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { error } = await sb
    .from("sitrep_public_calendars")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
