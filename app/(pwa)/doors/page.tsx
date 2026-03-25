import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { getWalklists, upsertWalklists, upsertLocations } from "@/lib/db/doors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Walklist = {
  id: string;
  name: string;
  mode: string;
  total_targets: number;
  visited_count: number;
};

// Sync from Supabase → SQLite (scoped to the authenticated user's assigned lists)
async function syncFromSupabase(tenantId: string, userId: string): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { "X-Tenant-Id": tenantId } } }
    );
    const uid = userId;

    let walklists: any[] = [];
    try {
      const { data, error } = await supabase.rpc("gs_list_walklists_by_mode_v2", {
        _tenant_id: tenantId,
        _user_id: uid,
        _mode: "knock",
      });
      if (!error) walklists = data ?? [];
    } catch {
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

    if (walklists.length === 0) return;

    upsertWalklists(
      tenantId,
      userId,
      walklists.map((w) => ({
        id: w.id,
        tenant_id: tenantId,
        user_id: userId ?? null,
        name: w.name ?? "(Untitled)",
        mode: w.mode ?? "knock",
        total_targets: w.total_targets ?? 0,
        visited_count: w.visited_count ?? 0,
        survey_id: (w as any).survey_id ?? null,
      }))
    );

    for (const wl of walklists) {
      try {
        // Paginate to bypass PostgREST 1000-row default cap
        const allLocs: any[] = [];
        let from = 0;
        const chunk = 1000;
        while (true) {
          const { data: page, error } = await supabase
            .rpc("gs_get_walklist_locations_v2", { _walklist_id: wl.id })
            .range(from, from + chunk - 1);
          if (error) break;
          if (!page?.length) break;
          allLocs.push(...page);
          if (page.length < chunk) break;
          from += chunk;
        }
        const locs = allLocs;
        if (!locs.length) continue;
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
      } catch {}
    }
  } catch {}
}

export default async function DoorsHome() {
  const [{ id: tenantId }, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  const userId = crmUser?.userId ?? null;

  // Sync only this user's assigned lists from Supabase → SQLite
  if (userId) await syncFromSupabase(tenantId, userId);

  // Read from SQLite (scoped to this user)
  const lists: Walklist[] = getWalklists(tenantId, userId);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Doors</h1>
        <p className="opacity-70">Choose a walklist to start knocking.</p>
      </header>

      <div className="gg-list">
        {lists.map((wl) => (
          <Link
            key={wl.id}
            href={`/doors/${wl.id}`}
            className="gg-item gg-item--button"
          >
            <div className="gg-text" style={{ flex: 1 }}>
              <h2>{wl.name}</h2>
              <p className="opacity-80">
                {wl.total_targets} locations • {wl.visited_count} visited
              </p>
            </div>
            <span aria-hidden>›</span>
          </Link>
        ))}
        {lists.length === 0 && (
          <div className="gg-item">
            <div className="gg-text">No door lists yet.</div>
          </div>
        )}
      </div>
    </main>
  );
}
