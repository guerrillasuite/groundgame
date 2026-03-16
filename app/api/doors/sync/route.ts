import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { upsertWalklists, upsertLocations } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

export async function POST() {
  const [{ id: tenantId }, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
  const uid = crmUser.userId;

  // Fetch walklists from Supabase
  let walklists: any[] = [];
  try {
    const { data, error } = await supabase.rpc("gs_list_walklists_by_mode_v2", {
      _tenant_id: tenantId,
      _user_id: uid,
      _mode: "knock",
    });
    if (error) throw error;
    walklists = data ?? [];
  } catch (e: any) {
    // Fallback to v1
    try {
      const { data } = await supabase.rpc("gs_list_walklists_by_mode_v1", {
        _tenant_id: tenantId,
        _user_id: uid,
        _mode: "knock",
      });
      walklists = (data ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? "(Untitled)",
        mode: w.mode ?? "knock",
        total_targets: w.total_targets ?? w.target_count ?? 0,
        visited_count: w.visited_count ?? w.completed_count ?? 0,
      }));
    } catch {}
  }

  // Upsert walklists into SQLite (scoped to this user)
  if (walklists.length > 0) {
    upsertWalklists(
      tenantId,
      uid,
      walklists.map((w) => ({
        id: w.id,
        tenant_id: tenantId,
        name: w.name ?? "(Untitled)",
        mode: w.mode ?? "knock",
        total_targets: w.total_targets ?? 0,
        visited_count: w.visited_count ?? 0,
      }))
    );
  }

  // Sync locations for each walklist
  let locationCount = 0;
  for (const wl of walklists) {
    try {
      const { data: locs, error } = await supabase.rpc(
        "gs_get_walklist_locations_v2",
        { _walklist_id: wl.id }
      );
      if (error || !locs?.length) continue;
      upsertLocations(
        wl.id,
        locs.map((r: any) => ({
          item_id: r.item_id,
          walklist_id: wl.id,
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
      locationCount += locs.length;
    } catch {}
  }

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    walklist_count: walklists.length,
    location_count: locationCount,
  });
}
