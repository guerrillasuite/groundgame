// app/crm/stops/page.tsx
import ListPage from "../_shared/ListPage";
import PeopleSearch from "../_shared/PeopleSearch";
import { getTenant } from "@/lib/tenant";
import { getServerSupabase } from "@/lib/supabase/server";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers as nextHeaders } from "next/headers"; // ⬅️ add nextHeaders

function mapSlugToTenantId(slug: string): string | null {
  switch (slug) {
    case "test":           return "00000000-0000-0000-0000-000000000000";
    case "guerrillasuite": return "85c60ca4-ee15-4d45-b27e-a8758d91f896";
    case "localhost":      return "00000000-0000-0000-0000-000000000000"; // dev fallback
    case "127.0.0.1":      return "00000000-0000-0000-0000-000000000000"; // dev fallback
    default:               return null;
  }
}

function getSupabaseReadOnly() {
  const store = cookies();

  // derive tenant from Host header
  const h = nextHeaders();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];
  const firstLabel = hostname.split(".")[0]; // 'test' from test.localhost:3001
  const tenantId = mapSlugToTenantId(firstLabel) ?? undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return store.get(name)?.value; },
        set() {},    // no-ops prevent “Cookies can only be modified…” in render
        remove() {},
      },
      // ⬇️ the missing piece: send tenant header so RLS can scope
      ...(tenantId ? { global: { headers: { "X-Tenant-Id": tenantId } } } : {}),
    }
  );
}


// Format to a text-sortable local string: "YYYY-MM-DD HH:mm" (America/Chicago)
function formatLocalYMDHM(isoLike: string | null | undefined) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  // Get parts in the target TZ
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value ?? "";
  // US gives MM/DD/YYYY; rebuild as YYYY-MM-DD HH:mm so string sort works
  const mm = get("month");
  const dd = get("day");
  const yyyy = get("year");
  const hh = get("hour");
  const min = get("minute");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export default async function StopsPage({
  searchParams,
}: { searchParams?: { q?: string } }) {
  const sb = getSupabaseReadOnly();
  const tenant = await getTenant();
  const q = (searchParams?.q ?? "").trim();

  let query = sb
    .from("stops")
    .select("id, stop_at, notes")
    .eq("tenant_id", tenant.id)
    .order("stop_at", { ascending: false });

  if (q) {
    // server-side filter on notes; we'll also client-filter on the formatted date string
    query = query.or([`notes.ilike.%${q}%`].join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows =
    (data ?? []).map((s: any) => {
      const when = formatLocalYMDHM(s.stop_at);
      return {
        id: s.id,
        stop_at: when,             // stays sortable as text (YYYY-MM-DD HH:mm)
        notes: s.notes ?? "",
      };
    }) ?? [];

  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.notes.toLowerCase().includes(ql) ||
        r.stop_at.toLowerCase().includes(ql)
    );
  }

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Stops</h1>
        <PeopleSearch placeholder="Search stops…" />
      </div>

      <ListPage
        title=""
        columns={[
          { key: "stop_at", label: "When", width: 220 },
          { key: "notes", label: "Notes" },
        ]}
        rows={rows}
      />
    </section>
  );
}
