import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Walklist = {
  id: string;
  name: string;
  mode: "knock" | "call" | "drop" | "email" | "text";
  total_targets: number;
  visited_count: number;
  updated_at: string | null;
};

const TEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002"; // default test list

export default async function DoorsHome() {
  const supabase = getServerSupabase();
  const { tenantId: tFromHelper, user, userId } = await getTenant();

  // resolve user id
  let uid =
    (user as any)?.id ??
    (user as any)?.user?.id ??
    userId ??
    null;
  if (!uid) {
    const { data: auth } = await supabase.auth.getUser();
    uid = auth?.user?.id ?? null;
  }

  // resolve tenant id
  let tenantId: string | null =
    typeof tFromHelper === "string" && tFromHelper ? tFromHelper : null;

  if (!tenantId && uid) {
    const { data: ut } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ut?.tenant_id) tenantId = String(ut.tenant_id);
  }

  if (!tenantId) {
    const { data: wl } = await supabase
      .from("walklists")
      .select("tenant_id")
      .eq("id", TEST_ID)
      .maybeSingle();
    if (wl?.tenant_id) tenantId = String(wl.tenant_id);
  }

  // fetch lists for "knock" mode via v2; fallback to v1 or to table join
  let lists: Walklist[] = [];
  try {
    const { data, error } = await supabase.rpc("gs_list_walklists_by_mode_v2", {
      _tenant_id: tenantId,
      _user_id: uid,
      _mode: "knock",
    });
    if (error) throw error;
    lists = (data ?? []) as Walklist[];
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (e?.code === "42883" || msg.includes("gs_list_walklists_by_mode_v2")) {
      const { data, error: e1 } = await supabase.rpc("gs_list_walklists_by_mode_v1", {
        _tenant_id: tenantId,
        _user_id: uid,
        _mode: "knock",
      });
      if (!e1) {
        lists = (data ?? []).map((w: any) => ({
          id: w.id,
          name: w.name ?? "(Untitled)",
          mode: (w.mode ?? "knock") as Walklist["mode"],
          total_targets: w.total_targets ?? w.target_count ?? 0,
          visited_count: w.visited_count ?? w.completed_count ?? 0,
          updated_at: w.updated_at ?? w.modified_at ?? w.created_at ?? null,
        })) as Walklist[];
      }
    }
  }

  // fallback to direct table join if RPC returns nothing
  if (lists.length === 0) {
    const ids: string[] = [];
    if (uid) {
      const { data: progress } = await supabase
        .from("walklist_progress")
        .select("walklist_id")
        .eq("user_id", uid);
      (progress ?? []).forEach((r) => {
        if (r.walklist_id && !ids.includes(r.walklist_id)) ids.push(r.walklist_id);
      });
    }
    if (!ids.includes(TEST_ID)) ids.push(TEST_ID);

    if (ids.length) {
      const { data: wlRows } = await supabase
        .from("walklists")
        .select("id,name,updated_at")
        .in("id", ids);

      const { data: items } = await supabase
        .from("walklist_items")
        .select("id,walklist_id")
        .in("walklist_id", ids);

      const counts = new Map<string, number>();
      (items ?? []).forEach((it) => {
        counts.set(it.walklist_id, (counts.get(it.walklist_id) ?? 0) + 1);
      });

      lists = (wlRows ?? []).map((w) => ({
        id: w.id,
        name: w.name ?? "(Untitled)",
        mode: "knock",
        total_targets: counts.get(w.id) ?? 0,
        visited_count: 0,
        updated_at: (w as any).updated_at ?? null,
      }));
    }
  }

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
