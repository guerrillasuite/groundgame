import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseWritable } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  // Delete child records first to satisfy FK constraints
  await sb.from("walklist_items").delete().eq("walklist_id", id).eq("tenant_id", tenant.id);
  await sb.from("walklist_assignments").delete().eq("walklist_id", id).eq("tenant_id", tenant.id);

  const { error } = await sb
    .from("walklists")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const survey_id = body.survey_id ?? null;

  const tenant = await getTenant();
  const sb = getServerSupabaseWritable();

  const { error } = await sb
    .from("walklists")
    .update({ survey_id })
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
