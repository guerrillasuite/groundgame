import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// GET /api/crm/opportunities/[id]/locations
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("opportunity_locations")
    .select(`
      id, location_id, role, is_primary, notes,
      location:locations(place_name, full_address, address_line1, city, state, postal_code)
    `)
    .eq("opportunity_id", id)
    .eq("tenant_id", tenant.id)
    .order("is_primary", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r: any) => {
    const loc = r.location;
    const displayText = loc
      ? ((loc.place_name ?? loc.address_line1 ?? loc.full_address ?? "") +
         (loc.city ? `, ${loc.city}` : "") +
         (loc.state ? `, ${loc.state}` : "")).trim() || null
      : null;
    return { ...r, location_display: displayText, location: undefined };
  });

  return NextResponse.json(rows);
}

// POST /api/crm/opportunities/[id]/locations
// Body: { location_id: string, is_primary?: boolean }
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body?.location_id) {
    return NextResponse.json({ error: "location_id is required" }, { status: 400 });
  }

  // Determine if this is the first location (auto-primary)
  const { count } = await sb
    .from("opportunity_locations")
    .select("id", { count: "exact", head: true })
    .eq("opportunity_id", id)
    .eq("tenant_id", tenant.id);

  const isPrimary = body.is_primary ?? (count === 0);

  // If marking as primary, demote existing primaries
  if (isPrimary) {
    await sb
      .from("opportunity_locations")
      .update({ is_primary: false })
      .eq("opportunity_id", id)
      .eq("tenant_id", tenant.id)
      .eq("is_primary", true);
  }

  const { data, error } = await sb
    .from("opportunity_locations")
    .insert({
      tenant_id:      tenant.id,
      opportunity_id: id,
      location_id:    body.location_id,
      is_primary:     isPrimary,
      role:           "service_at",
    })
    .select("id, location_id, role, is_primary, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
