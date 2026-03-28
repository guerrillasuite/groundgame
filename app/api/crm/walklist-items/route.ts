import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { findOrCreateLocation, findOrCreateHousehold } from "@/lib/crm/location-utils";
import { upsertLocations } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const body = await req.json().catch(() => null);
  const { walklist_id, address_line1, city, state, postal_code, person_id: rawPersonId, new_person } = body ?? {};

  if (!walklist_id) {
    return NextResponse.json({ error: "walklist_id is required" }, { status: 400 });
  }
  if (!address_line1?.trim() && !rawPersonId && !new_person?.first_name) {
    return NextResponse.json({ error: "address_line1 or person_id or new_person is required" }, { status: 400 });
  }

  // Create person inline if requested
  let person_id = rawPersonId ?? null;
  if (!person_id && new_person?.first_name) {
    const { data: np } = await sb
      .from("people")
      .insert({ first_name: new_person.first_name, last_name: new_person.last_name ?? null, phone: new_person.phone ?? null, tenant_id: tenantId })
      .select("id").single();
    if (np?.id) {
      person_id = np.id;
      await sb.from("tenant_people").insert({ person_id: np.id, tenant_id: tenantId });
    }
  }

  // Resolve location (for doors stops) or just use person (for dials stops)
  let locationId: string | null = null;
  let householdId: string | null = null;
  let householdName: string | null = null;

  if (address_line1?.trim()) {
    try {
      const loc = await findOrCreateLocation(sb, tenantId, { address_line1, city, state, postal_code });
      locationId = loc.id;
      const hh = await findOrCreateHousehold(sb, tenantId, loc.id, address_line1.trim());
      householdId = hh.id;
      householdName = address_line1.trim();
    } catch (err: any) {
      return NextResponse.json({ error: `Location error: ${err.message}` }, { status: 500 });
    }
  }

  // Get max order_index for this walklist
  const { data: maxRow } = await sb
    .from("walklist_items")
    .select("order_index")
    .eq("walklist_id", walklist_id)
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = ((maxRow as any)?.order_index ?? -1) + 1;

  // Insert new walklist item
  const { data: newItem, error: insertErr } = await sb
    .from("walklist_items")
    .insert({
      walklist_id,
      tenant_id: tenantId,
      location_id: locationId,
      person_id: person_id ?? null,
      order_index: nextIndex,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !newItem) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create walklist item" },
      { status: 500 }
    );
  }

  const itemId = (newItem as any).id;

  // Fetch location lat/lng for SQLite cache
  let lat: number | null = null;
  let lng: number | null = null;
  if (locationId) {
    const { data: locRow } = await sb
      .from("locations")
      .select("lat, lon")
      .eq("id", locationId)
      .single();
    lat = (locRow as any)?.lat ?? null;
    lng = (locRow as any)?.lon ?? null;
  }

  // Update SQLite cache so the item is immediately visible in the walklist view
  try {
    upsertLocations(walklist_id, [
      {
        item_id: itemId,
        walklist_id,
        idx: nextIndex,
        location_id: locationId,
        lat,
        lng,
        address_line1: address_line1 ?? null,
        city: city ?? null,
        state: state ?? null,
        postal_code: postal_code ?? null,
        household_id: householdId,
        household_name: householdName,
        primary_person_id: person_id ?? null,
        primary_person_name: null,
        last_result: null,
        last_result_at: null,
      },
    ]);
  } catch {
    // Non-fatal — SQLite cache is best-effort
  }

  return NextResponse.json({ item_id: itemId, idx: nextIndex, location_id: locationId });
}
