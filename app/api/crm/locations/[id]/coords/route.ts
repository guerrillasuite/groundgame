import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { updateCoordsForLocation } from "@/lib/db/doors";

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
  { params }: { params: { id: string } }
) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const body = await req.json().catch(() => null);
  const { lat, lng } = body ?? {};

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required numbers" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lat must be −90..90, lng −180..180" }, { status: 400 });
  }

  const { error } = await sb
    .from("locations")
    .update({ lat, lon: lng })
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update SQLite cache so the map pin moves immediately without a full resync
  try {
    updateCoordsForLocation(params.id, lat, lng);
  } catch {
    // Non-fatal — SQLite cache is best-effort
  }

  return NextResponse.json({ ok: true });
}
