/**
 * Geocoding helpers using the free US Census Geocoder.
 * No API key required. US addresses only.
 *
 * Queries Supabase for locations missing lat/lon, geocodes them,
 * and writes results back to Supabase. SQLite gets correct coords
 * on the next natural doors sync.
 */

import { createClient } from "@supabase/supabase-js";

const CENSUS_BASE =
  "https://geocoding.geo.census.gov/geocoder/locations/address";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function geocodeAddress(loc: {
  address_line1: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    street: loc.address_line1,
    benchmark: "Public_AR_Current",
    format: "json",
  });

  // Prefer zip as anchor — zip codes don't cross state lines
  if (loc.postal_code) {
    params.set("zip", loc.postal_code);
  } else {
    if (loc.city) params.set("city", loc.city);
    if (loc.state) params.set("state", loc.state);
  }

  try {
    const res = await fetch(`${CENSUS_BASE}?${params}`, {
      headers: { "User-Agent": "GroundGame/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const match = json?.result?.addressMatches?.[0];
    if (!match) return null;

    // Validate zip matches (if we have one) — strongest location anchor
    if (loc.postal_code) {
      const returnedZip = (match.addressComponents?.zip ?? "").trim();
      // Accept if first 5 digits match
      if (returnedZip && returnedZip.slice(0, 5) !== loc.postal_code.trim().slice(0, 5)) {
        return null;
      }
    } else if (loc.state) {
      // Fall back to state validation when no zip
      const returnedState = (match.addressComponents?.state ?? "").toUpperCase().trim();
      const expectedState = loc.state.toUpperCase().trim();
      if (returnedState && returnedState !== expectedState) {
        return null;
      }
    }

    const lat = parseFloat(match.coordinates?.y);
    const lng = parseFloat(match.coordinates?.x);
    if (!isFinite(lat) || !isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Queries Supabase for locations missing lat/lon, geocodes them,
 * and writes back to Supabase. Works in parallel chunks of 5.
 * SQLite will pick up correct coords on the next doors sync.
 */
export async function geocodeMissingLocations(
  tenantId: string,
  batchLimit = 50
): Promise<{ total: number; geocoded: number; failed: number; skipped: number }> {
  const sb = makeSb();

  // Count total locations needing geocoding for accurate "skipped" reporting
  const { count } = await sb
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("geocode_failed", false)
    .or("lat.is.null,lon.is.null")
    .not("address_line1", "is", null);

  const total = count ?? 0;
  if (total === 0) return { total: 0, geocoded: 0, failed: 0, skipped: 0 };

  // Fetch the batch to process
  const { data: locs, error } = await sb
    .from("locations")
    .select("id, address_line1, city, state, postal_code")
    .eq("tenant_id", tenantId)
    .eq("geocode_failed", false)
    .or("lat.is.null,lon.is.null")
    .not("address_line1", "is", null)
    .limit(batchLimit);

  if (error || !locs) return { total, geocoded: 0, failed: 0, skipped: total };

  let geocoded = 0;
  let failed = 0;

  const CHUNK = 5;
  for (let i = 0; i < locs.length; i += CHUNK) {
    const chunk = locs.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (loc) => {
        if (!loc.address_line1) {
          failed++;
          await sb.from("locations").update({ geocode_failed: true }).eq("id", loc.id);
          return;
        }

        const coords = await geocodeAddress({
          address_line1: loc.address_line1,
          city: loc.city,
          state: loc.state,
          postal_code: loc.postal_code,
        });

        if (!coords) {
          failed++;
          await sb.from("locations").update({ geocode_failed: true }).eq("id", loc.id);
          return;
        }

        const { error: updateErr } = await sb
          .from("locations")
          .update({ lat: coords.lat, lon: coords.lng })
          .eq("id", loc.id);

        if (updateErr) { failed++; } else { geocoded++; }
      })
    );
  }

  return { total, geocoded, failed, skipped: Math.max(0, total - locs.length) };
}
