// app/crm/households/page.tsx
import ListPage from "../_shared/ListPage";
import PeopleSearch from "../_shared/PeopleSearch";
import { getServerSupabase } from "@/lib/supabase/server"; // ⛔️ don't import the shared client
import { getTenant } from "@/lib/tenant";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type HH = { id: string; name: string | null; location_id: string | null };

function getSupabaseReadOnly() {
  // Read cookies, but NEVER write during render (prevents Next.js cookie error)
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const sb = getServerSupabase(); // sends X‑Tenant‑Id based on host
  const tenant = await getTenant();
  const q = (searchParams?.q ?? "").trim();

  // 1) Households (id, name, location_id)
  let hhq = sb
    .from("households")
    .select("id,name,location_id")
    .eq("tenant_id", tenant.id)
    .order("name", { ascending: true });

  if (q) hhq = hhq.ilike("name", `%${q}%`);

  const { data: households = [], error: hhErr } = await hhq;
  if (hhErr) throw new Error(hhErr.message);

  const hh: HH[] = households;
  const hhIds = hh.map((h) => h.id);

  // 2) Addresses via households.location_id → locations (prefer normalized_key, fallback to parts)
  const addressByHH = new Map<string, string>();
  const locIds = Array.from(
    new Set(hh.map((h) => h.location_id).filter(Boolean) as string[])
  );

  const fmtAddr = (loc: any) => {
    const nk = (loc?.normalized_key ?? "").trim();
    if (nk) return nk;
    const cityState = [loc?.city, loc?.state].filter(Boolean).join(", ");
    return [loc?.address_line1, cityState, loc?.postal_code]
      .filter(Boolean)
      .join(", ");
  };

  if (locIds.length) {
    // Try with tenant filter first; if none, try without (for shared/global locations)
    const fetchLocs = async (withTenant: boolean) => {
      let q = sb
        .from("locations")
        .select("id, normalized_key, address_line1, city, state, postal_code")
        .in("id", locIds);
      if (withTenant) q = q.eq("tenant_id", tenant.id);
      const { data = [] } = await q;
      return data as any[];
    };

    let locs = await fetchLocs(true);
    if (!locs.length) locs = await fetchLocs(false);

    const byId = new Map(locs.map((l) => [l.id, l]));
    for (const h of hh) {
      const loc = h.location_id ? byId.get(h.location_id) : null;
      if (loc) addressByHH.set(h.id, fmtAddr(loc));
    }
  }

  // 3) People per household (support both linking styles)
  const peopleByHH = new Map<string, Set<string>>();
  if (hhIds.length) {
    // person_households → people
    const { data: ph = [] } = await sb
      .from("person_households")
      .select("household_id, person:person_id(first_name,last_name)")
      .in("household_id", hhIds)
      .eq("tenant_id", tenant.id);

    for (const r of ph) {
      const full = `${r.person?.first_name ?? ""} ${r.person?.last_name ?? ""}`.trim();
      if (!full) continue;
      (peopleByHH.get(r.household_id) ??
        peopleByHH.set(r.household_id, new Set()).get(r.household_id)!)!.add(full);
    }

    // direct people.household_id
    const { data: ppl = [] } = await sb
      .from("people")
      .select("first_name,last_name,household_id")
      .in("household_id", hhIds)
      .eq("tenant_id", tenant.id);

    for (const p of ppl) {
      const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      if (!full || !p.household_id) continue;
      (peopleByHH.get(p.household_id) ??
        peopleByHH.set(p.household_id, new Set()).get(p.household_id)!)!.add(full);
    }
  }

  // 4) Build table rows (client-side filter also hits address/people text)
  let rows = hh.map((h) => ({
    id: h.id,
    name: (h.name?.trim() ?? "") || "(unnamed)",
    address: addressByHH.get(h.id) ?? "",
    people: Array.from(peopleByHH.get(h.id) ?? []).sort().join(", "),
  }));

  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(ql) ||
        r.address.toLowerCase().includes(ql) ||
        r.people.toLowerCase().includes(ql)
    );
  }

  // 5) Render (matches People page layout/components)
  return (
    <section className="stack">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}
      >
        <h1 style={{ margin: 0 }}>Households</h1>
        <PeopleSearch placeholder="Search households…" />
      </div>

      <ListPage
        title=""
        columns={[
          { key: "name", label: "Name", width: 240 },
          { key: "address", label: "Address", width: 360 },
          { key: "people", label: "People" },
        ]}
        rows={rows}
      />
    </section>
  );
}
