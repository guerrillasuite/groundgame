import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; location_id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// DELETE /api/crm/opportunities/[id]/locations/[location_id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, location_id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { error } = await sb
    .from("opportunity_locations")
    .delete()
    .eq("id", location_id)
    .eq("opportunity_id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/crm/opportunities/[id]/locations/[location_id]
// Body: { is_primary: true } — promotes this row, demotes others
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, location_id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (body?.is_primary === true) {
    // Demote all existing primaries first
    await sb
      .from("opportunity_locations")
      .update({ is_primary: false })
      .eq("opportunity_id", id)
      .eq("tenant_id", tenant.id)
      .eq("is_primary", true);

    const { error } = await sb
      .from("opportunity_locations")
      .update({ is_primary: true })
      .eq("id", location_id)
      .eq("opportunity_id", id)
      .eq("tenant_id", tenant.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
