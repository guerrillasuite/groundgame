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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const sb = makeSb(tenant.id);

  const updates: Record<string, unknown> = {};
  if (body?.name !== undefined) updates.name = body.name.trim();
  if (body?.color !== undefined) updates.color = body.color;
  if (body?.is_public !== undefined) updates.is_public = body.is_public;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await sb
    .from("sitrep_item_types")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const { id } = await params;
  const sb = makeSb(tenant.id);

  const { data: existing } = await sb
    .from("sitrep_item_types")
    .select("is_system")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (existing?.is_system) {
    return NextResponse.json({ error: "Cannot delete system types" }, { status: 400 });
  }

  const { error } = await sb
    .from("sitrep_item_types")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
