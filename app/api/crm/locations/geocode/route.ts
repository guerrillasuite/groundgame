/**
 * POST /api/crm/locations/geocode
 *
 * Geocodes Supabase locations missing lat/lon using the free US Census Geocoder.
 * Writes results back to Supabase; SQLite picks up correct coords on next doors sync.
 *
 * Returns: { total, geocoded, failed, skipped }
 */

import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { geocodeMissingLocations } from "@/lib/geocode";

export const dynamic = "force-dynamic";

export async function POST() {
  const tenant = await getTenant();
  const result = await geocodeMissingLocations(tenant.id, 50);
  return NextResponse.json(result);
}
