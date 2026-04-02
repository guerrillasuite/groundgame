// app/crm/stops/page.tsx
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import ListPage from "../_shared/ListPage";
import PeopleSearch from "../_shared/PeopleSearch";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function formatLocalDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function labelResult(r: string | null) {
  if (!r) return "—";
  return r.replace(/_/g, " ");
}

export default async function StopsPage({
  searchParams,
}: { searchParams?: { q?: string } }) {
  const tenant = await getTenant();
  if (!hasFeature(tenant.features, "crm_stops")) redirect("/crm");
  const sb = makeSb(tenant.id);
  const q = (searchParams?.q ?? "").trim();

  let query = sb
    .from("stops")
    .select("id, stop_at, channel, result, notes, person_id, walklist_id")
    .eq("tenant_id", tenant.id)
    .order("stop_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.ilike("notes", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const stops = data ?? [];

  // Batch-fetch person names + walklist names
  const personIds = [...new Set(stops.map((s: any) => s.person_id).filter(Boolean))];
  const walklistIds = [...new Set(stops.map((s: any) => s.walklist_id).filter(Boolean))];

  const [peopleRes, listsRes] = await Promise.all([
    personIds.length
      ? sb.from("people").select("id, first_name, last_name").in("id", personIds)
      : Promise.resolve({ data: [] }),
    walklistIds.length
      ? sb.from("walklists").select("id, name").in("id", walklistIds)
      : Promise.resolve({ data: [] }),
  ]);

  const personMap = new Map(
    (peopleRes.data ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()])
  );
  const listMap = new Map(
    (listsRes.data ?? []).map((l: any) => [l.id, l.name])
  );

  let rows = stops.map((s: any) => ({
    id: s.id,
    when: formatLocalDate(s.stop_at),
    channel: s.channel ?? "—",
    result: labelResult(s.result),
    person: personMap.get(s.person_id) || "—",
    list: listMap.get(s.walklist_id) || "—",
    notes: s.notes ?? "",
  }));

  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.notes.toLowerCase().includes(ql) ||
        r.person.toLowerCase().includes(ql) ||
        r.result.toLowerCase().includes(ql) ||
        r.when.includes(ql)
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
        rowHrefPrefix="/crm/stops/"
        columns={[
          { key: "when",    label: "When",    width: 160 },
          { key: "channel", label: "Channel", width: 80 },
          { key: "result",  label: "Result",  width: 140 },
          { key: "person",  label: "Person",  width: 160 },
          { key: "list",    label: "List",    width: 160 },
          { key: "notes",   label: "Notes" },
        ]}
        rows={rows}
      />
    </section>
  );
}
