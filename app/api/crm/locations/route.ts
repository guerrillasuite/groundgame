import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { geocodeAddress } from "@/lib/geocodio";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// POST /api/crm/locations
// Used by LocationPicker manual entry. Does NOT deduplicate.
// Body: { address_line1, unit?, city, state, postal_code, place_name? }
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const body = await req.json().catch(() => null);

  if (!body?.address_line1?.trim()) {
    return NextResponse.json({ error: "address_line1 is required" }, { status: 400 });
  }

  const fullAddress = [
    body.address_line1,
    body.unit,
    body.city,
    body.state,
    body.postal_code,
  ].filter(Boolean).join(", ");

  const geo = await geocodeAddress(fullAddress);

  const { data, error } = await sb
    .from("locations")
    .insert({
      tenant_id:              tenant.id,
      address_line1:          body.address_line1.trim(),
      unit:                   body.unit?.trim() ?? null,
      city:                   body.city?.trim() ?? null,
      state:                  body.state?.trim() ?? null,
      postal_code:            body.postal_code?.trim() ?? null,
      place_name:             body.place_name?.trim() ?? null,
      full_address:           geo?.formatted_address ?? fullAddress,
      lat:                    geo?.lat ?? null,
      lon:                    geo?.lon ?? null,
      congressional_district: geo?.congressional_district ?? null,
      state_house_district:   geo?.state_house_district ?? null,
      state_senate_district:  geo?.state_senate_district ?? null,
      county_name:            geo?.county_name ?? null,
      time_zone:              geo?.time_zone ?? null,
      census_tract:           geo?.census_tract ?? null,
      zip4:                   geo?.zip4 ?? null,
      external_place_source:  "manual",
      geocode_failed:         geo === null,
      source:                 "user_entry",
    })
    .select("id, place_name, full_address, address_line1, city, state, postal_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
