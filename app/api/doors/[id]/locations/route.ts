import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getLocations, upsertLocations } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

async function fetchAllRpc(supabase: any, rpcName: string, args: Record<string, any>, chunkSize = 1000): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.rpc(rpcName, args).range(from, from + chunkSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Serve from SQLite cache if populated
  const cached = getLocations(id);
  if (cached.length > 0) return NextResponse.json(cached);

  // Cache miss — fetch from Supabase.
  // Prefer service role key (no statement timeout, no auth required).
  // Fall back to anon key + tenant header if service role key not set.
  const { id: tenantId } = await getTenant();
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );

  let data: any[];
  try {
    data = await fetchAllRpc(supabase, "gs_get_walklist_locations_v2", { _walklist_id: id });
  } catch (error: any) {
    console.error("[locations] RPC error:", error.code, error.message);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
  if (!data.length) return NextResponse.json([]);

  upsertLocations(
    id,
    data.map((r: any) => ({
      item_id: r.item_id,
      walklist_id: id,
      idx: r.idx ?? 0,
      location_id: r.location_id ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      address_line1: r.address_line1 ?? null,
      city: r.city ?? null,
      state: r.state ?? null,
      postal_code: r.postal_code ?? null,
      household_id: r.household_id ?? null,
      household_name: r.household_name ?? null,
      primary_person_id: r.primary_person_id ?? null,
      primary_person_name: r.primary_person_name ?? null,
      last_result: r.last_result ?? null,
      last_result_at: r.last_result_at ?? null,
    }))
  );

  return NextResponse.json(getLocations(id));
}
