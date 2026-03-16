// app/crm/lists/[id]/page.tsx
import ListPage from "../../_shared/ListPage";
import PeopleSearch from "../../_shared/PeopleSearch";
import SurveyAssignmentPanel from "@/app/components/lists/SurveyAssignmentPanel";
import { getTenant } from "@/lib/tenant";
import { getSurveys } from "@/lib/db/supabase-surveys";
import { getCrmUser } from "@/lib/crm-auth";
import { notFound } from "next/navigation";

import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// Fetch all rows using range pagination to bypass PostgREST 1000-row cap
async function fetchAll(buildQuery: () => any, chunkSize = 1000): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + chunkSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}

// Query a table in chunks to avoid PostgREST URL length limits on large .in() arrays
async function queryInChunks(
  sb: any,
  table: string,
  select: string,
  inCol: string,
  ids: string[],
  extraFilters?: (q: any) => any,
  chunkSize = 200
): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    let q = sb.from(table).select(select).in(inCol, ids.slice(i, i + chunkSize));
    if (extraFilters) q = extraFilters(q);
    const { data } = await q;
    if (data) all.push(...data);
  }
  return all;
}

type Params = { params: { id: string } };
type ListMeta = { id: string; name: string | null; mode: string | null; survey_id: string | null };

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
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  const sb = makeSb(tenant.id);
  const q = (searchParams?.q ?? "").trim().toLowerCase();

  // 1) Meta + survey assignment
  const { data: meta, error: mErr } = await sb
    .from("walklists")
    .select("id,name,mode,survey_id")
    .eq("id", params.id)
    .eq("tenant_id", tenant.id)
    .single();
  if (mErr || !meta) throw new Error(mErr?.message ?? "List not found");

  // Guard: field users can only view lists they're assigned to
  if (crmUser && !crmUser.isAdmin) {
    const { data: assignment } = await sb
      .from("walklist_assignments")
      .select("walklist_id")
      .eq("walklist_id", params.id)
      .eq("user_id", crmUser.userId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!assignment) notFound();
  }

  // Fetch all surveys for the assignment dropdown
  const allSurveys = await getSurveys(tenant.id);
  const titleBase = meta.name ?? "List";
  const modeLower = (meta.mode ?? "").toLowerCase();

  // 2) Pull ALL items (scoped to this tenant & list) — paginated to bypass 1000-row cap
  let allItems: any[] = [];
  try {
    allItems = await fetchAll(() =>
      sb
        .from("walklist_items")
        .select("person_id, location_id")
        .eq("walklist_id", params.id)
        .eq("tenant_id", tenant.id)
    );
  } catch (e: any) {
    throw new Error(e.message);
  }

  const personIds = Array.from(new Set(allItems.map(r => r.person_id).filter(Boolean) as string[]));
  const locationIds = Array.from(new Set(allItems.map(r => r.location_id).filter(Boolean) as string[]));

  // -------- PEOPLE PATH (for call lists or if personIds exist) --------
  let peopleRows: Array<{ id: string; name: string; phone: string; email: string }> = [];
  let peopleResolved = 0;

  if (personIds.length || modeLower === "call") {
    // Fetch all people by ID using chunked queries (bypasses PostgREST 1000-row cap)
    const ppl = await queryInChunks(
      sb, "people", "id,first_name,last_name,phone,email", "id", personIds,
      (q) => q.eq("tenant_id", tenant.id)
    );
    peopleRows = ppl.map((p: any) => ({
      id: p.id,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      phone: p.phone ?? "",
      email: p.email ?? "",
    }));
    peopleResolved = peopleRows.length;

    // Fallback: placeholders if RLS is blocking
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
  let locationRows: Array<{ id: string; address: string; name: string; phone: string }> = [];
  if (!personIds.length || modeLower !== "call") {
    if (locationIds.length) {
      // Fetch locations in chunks to avoid URL length limits
      const fetchLocs = async (withTenant: boolean) => {
        const rows = await queryInChunks(
          sb,
          "locations",
          "id,normalized_key,address_line1,city,state,postal_code",
          "id",
          locationIds,
          withTenant ? (q) => q.eq("tenant_id", tenant.id) : undefined
        );
        return rows.map((l: any) => ({ id: l.id, address: fmtAddr(l) }));
      };
      const baseLocs = await fetchLocs(true).then(r => r.length ? r : fetchLocs(false));

      // Enrich with people: locations → households → people (both link styles)
      const peopleByLocId = new Map<string, { name: string; phone: string }[]>();

      // Fetch households for these locations in chunks
      const hhsForLoc = await queryInChunks(
        sb,
        "households",
        "id, location_id",
        "location_id",
        locationIds,
        (q) => q.eq("tenant_id", tenant.id)
      );

      const hhToLocId = new Map<string, string>();
      const locToHhId = new Map<string, string>();
      for (const h of hhsForLoc as any[]) {
        hhToLocId.set(h.id, h.location_id);
        if (!locToHhId.has(h.location_id)) locToHhId.set(h.location_id, h.id);
      }

      const hhIds2 = [...hhToLocId.keys()];
      if (hhIds2.length) {
        const addPerson = (locId: string, p: any) => {
          const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          if (!name) return;
          const arr = peopleByLocId.get(locId) ?? [];
          if (!arr.some(x => x.name === name)) {
            arr.push({ name, phone: p.phone ?? "" });
          }
          peopleByLocId.set(locId, arr);
        };

        // Style A: direct people.household_id (chunked)
        const directPeople = await queryInChunks(
          sb,
          "people",
          "first_name, last_name, phone, household_id",
          "household_id",
          hhIds2,
          (q) => q.eq("tenant_id", tenant.id)
        );
        for (const p of directPeople as any[]) {
          const locId = p.household_id ? hhToLocId.get(p.household_id) : null;
          if (locId) addPerson(locId, p);
        }

        // Style B: person_households junction table (chunked)
        const phRows = await queryInChunks(
          sb,
          "person_households",
          "household_id, person_id",
          "household_id",
          hhIds2,
          (q) => q.eq("tenant_id", tenant.id)
        );
        const phPersonIds = phRows.map((r: any) => r.person_id).filter(Boolean);
        if (phPersonIds.length) {
          const phPersonToHH = new Map(phRows.map((r: any) => [r.person_id, r.household_id]));
          const phPeople = await queryInChunks(
            sb,
            "people",
            "id, first_name, last_name, phone",
            "id",
            phPersonIds
          );
          for (const p of phPeople as any[]) {
            const hhId = phPersonToHH.get(p.id);
            const locId = hhId ? hhToLocId.get(hhId) : null;
            if (locId) addPerson(locId, p);
          }
        }
      }

      locationRows = baseLocs.map((r: any) => {
        const people = peopleByLocId.get(r.id) ?? [];
        return {
          id: locToHhId.get(r.id) ?? r.id,
          address: r.address,
          name: people.map(p => p.name).filter(Boolean).join(", "),
          phone: people.map(p => p.phone).filter(Boolean).join(", "),
        };
      });
    }
    if (q) {
      locationRows = locationRows.filter(r =>
        filterLike(r.address) || filterLike(r.name) || filterLike(r.phone)
      );
    }
  }

  const hasPeopleIds = personIds.length > 0;
  const hasPeopleVisible = peopleResolved > 0;
  const hasLocationIds = locationIds.length > 0;

  // Decide what to render:
  // - If any people IDs exist (call list), render People.
  // - Else render Locations.
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
        <SurveyAssignmentPanel
          listId={params.id}
          currentSurveyId={(meta as ListMeta).survey_id ?? null}
          surveys={allSurveys.map((s) => ({ id: s.id, title: s.title }))}
        />
        <ListPage
          title=""
          rowHrefPrefix="/crm/people/"
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

  // Otherwise, show locations
  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{titleBase} — Locations</h1>
        <PeopleSearch placeholder="Search locations in this list…" />
      </div>
      <SurveyAssignmentPanel
        listId={params.id}
        currentSurveyId={(meta as ListMeta).survey_id ?? null}
        surveys={allSurveys.map((s) => ({ id: s.id, title: s.title }))}
      />
      <ListPage
        title=""
        rowHrefPrefix="/crm/households/"
        columns={[
          { key: "address", label: "Address", width: 320 },
          { key: "name", label: "Name", width: 220 },
          { key: "phone", label: "Phone", width: 160 },
        ]}
        rows={locationRows}
      />
    </section>
  );
}


