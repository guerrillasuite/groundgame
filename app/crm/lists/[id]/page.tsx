// app/crm/lists/[id]/page.tsx
import ListPage from "../../_shared/ListPage";
import PeopleSearch from "../../_shared/PeopleSearch";
import { getTenant } from "@/lib/tenant";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type Params = { params: { id: string } };

function getSupabaseReadOnly() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => store.get(n)?.value, set() {}, remove() {} } }
  );
}

const fmtAddr = (l: any) => {
  const nk = (l?.normalized_key ?? "").trim();
  if (nk) return nk;
  const line2 = [l?.city, l?.state].filter(Boolean).join(", ");
  return [l?.address_line1, line2, l?.postal_code].filter(Boolean).join(", ");
};

export default async function ListDetail({
  params,
  searchParams,
}: Params & { searchParams?: { q?: string } }) {
  const sb = getSupabaseReadOnly();
  const tenant = await getTenant();
  const q = (searchParams?.q ?? "").trim().toLowerCase();

  // 1) Meta (title only)
  const { data: meta, error: mErr } = await sb
    .from("walklists")
    .select("id,name,mode")
    .eq("id", params.id)
    .eq("tenant_id", tenant.id)
    .single();
  if (mErr || !meta) throw new Error(mErr?.message ?? "List not found");
  const titleBase = meta.name ?? "List";
  const modeLower = (meta.mode ?? "").toLowerCase();

  // 2) Pull items (scoped to this tenant & list)
  const { data: items, error: iErr } = await sb
    .from("walklist_items")
    .select("person_id, location_id")
    .eq("walklist_id", params.id)
    .eq("tenant_id", tenant.id);
  if (iErr) throw new Error(iErr.message);

  const personIds = Array.from(new Set((items ?? []).map(r => r.person_id).filter(Boolean) as string[]));
  const locationIds = Array.from(new Set((items ?? []).map(r => r.location_id).filter(Boolean) as string[]));

  // -------- PEOPLE PATH (for call lists or if personIds exist) --------
  let peopleRows: Array<{ id: string; name: string; phone: string; email: string }> = [];
  let peopleResolved = 0;

  if (personIds.length || modeLower === "call") {
    // (A) Prefer nested select via walklist_items → people (best chance under RLS)
    const { data: nested } = await sb
      .from("walklist_items")
      .select("person:person_id(id,first_name,last_name,phone,email)")
      .eq("walklist_id", params.id)
      .eq("tenant_id", tenant.id);

    const fromNested =
      (nested ?? [])
        .map((r: any) => r.person)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          phone: p.phone ?? "",
          email: p.email ?? "",
        })) ?? [];

    peopleResolved = fromNested.length;
    peopleRows = fromNested;

    // (B) If nested returned nothing but we have IDs, try direct lookup (no tenant filter)
    if (!peopleRows.length && personIds.length) {
      const { data: ppl } = await sb
        .from("people")
        .select("id,first_name,last_name,phone,email")
        .in("id", personIds); // no tenant filter on purpose
      peopleRows =
        (ppl ?? []).map((p: any) => ({
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          phone: p.phone ?? "",
          email: p.email ?? "",
        })) ?? [];
      peopleResolved = peopleRows.length;
    }

    // (C) Final fallback: if we still have nothing but there ARE personIds,
    // render placeholders so the page isn't blank (indicates RLS is blocking).
    if (!peopleRows.length && personIds.length) {
      peopleRows = personIds.map(id => ({
        id,
        name: "(unavailable due to access policy)",
        phone: "",
        email: "",
      }));
    }
  }

  // Apply ?q= filter for people
  const filterLike = (s: string) => s.toLowerCase().includes(q);
  if (q) {
    peopleRows = peopleRows.filter(
      r => filterLike(r.name) || filterLike(r.phone) || filterLike(r.email)
    );
  }

  // -------- LOCATIONS PATH (default if not call) --------
  let locationRows: Array<{ id: string; address: string }> = [];
  if (!personIds.length || modeLower !== "call") {
    if (locationIds.length) {
      // Try with tenant; if 0, try without (some locations may be global/zero-tenant)
      const fetchLocs = async (withTenant: boolean) => {
        let q = sb
          .from("locations")
          .select("id,normalized_key,address_line1,city,state,postal_code")
          .in("id", locationIds);
        if (withTenant) q = q.eq("tenant_id", tenant.id);
        const { data } = await q;
        return (data ?? []).map((l: any) => ({ id: l.id, address: fmtAddr(l) }));
      };
      locationRows = await fetchLocs(true);
      if (!locationRows.length) locationRows = await fetchLocs(false);
    }
    if (q) {
      locationRows = locationRows.filter(r => filterLike(r.address));
    }
  }

  const hasPeopleIds = personIds.length > 0;
  const hasPeopleVisible = peopleResolved > 0;
  const hasLocationIds = locationIds.length > 0;
  const hasLocationVisible = locationRows.length > 0;

  // Decide what to render:
  // - If any people **visible**, render People.
  // - Else if people IDs exist (but not visible), still render People (with placeholders) so it's not blank.
  // - Else render Locations if any.
  if (hasPeopleIds || modeLower === "call") {
    const subtitle =
      hasPeopleVisible
        ? "People"
        : hasPeopleIds
        ? "People (some items hidden by access policy)"
        : "People";
    return (
      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>{titleBase} — {subtitle}</h1>
          <PeopleSearch placeholder="Search people in this list…" />
        </div>
        <ListPage
          title=""
          columns={[
            { key: "name", label: "Name", width: 280 },
            { key: "phone", label: "Phone", width: 160 },
            { key: "email", label: "Email", width: 240 },
          ]}
          rows={peopleRows}
        />
      </section>
    );
  }

  // Otherwise, show locations if available
  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{titleBase} — Locations</h1>
        <PeopleSearch placeholder="Search locations in this list…" />
      </div>
      <ListPage
        title=""
        columns={[{ key: "address", label: "Address", width: 520 }]}
        rows={locationRows}
      />
    </section>
  );
}

