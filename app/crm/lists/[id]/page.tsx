// app/crm/lists/[id]/page.tsx
import ListPage from "../../_shared/ListPage";
import PeopleSearch from "../../_shared/PeopleSearch";
import SurveyAssignmentPanel from "@/app/components/lists/SurveyAssignmentPanel";
import { getTenant } from "@/lib/tenant";
import { getSurveys } from "@/lib/db/supabase-surveys";
import { getCrmUser } from "@/lib/crm-auth";
import { notFound } from "next/navigation";
import { resolveDispoConfig, buildColorMap } from "@/lib/dispositionConfig";

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
type ListMeta = { id: string; name: string | null; mode: string | null; survey_id: string | null; call_capture_mode: string | null };

const fmtAddr = (l: any) => {
  const nk = (l?.normalized_key ?? "").trim();
  if (nk) return nk;
  const line2 = [l?.city, l?.state].filter(Boolean).join(", ");
  return [l?.address_line1, line2, l?.postal_code].filter(Boolean).join(", ");
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "2-digit", day: "2-digit", year: "2-digit",
  });
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
    .select("id,name,mode,survey_id,call_capture_mode")
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
        .select("id, person_id, location_id, company_id, order_index")
        .eq("walklist_id", params.id)
        .eq("tenant_id", tenant.id)
        .order("order_index", { ascending: true })
    );
  } catch (e: any) {
    throw new Error(e.message);
  }

  const personIds = Array.from(new Set(allItems.map(r => r.person_id).filter(Boolean) as string[]));
  const locationIds = Array.from(new Set(allItems.map(r => r.location_id).filter(Boolean) as string[]));
  const companyIds = Array.from(new Set(allItems.map(r => r.company_id).filter(Boolean) as string[]));

  // Fetch last stop result per item to drive color coding
  const allItemIds = allItems.map(r => r.id).filter(Boolean) as string[];
  const allStops = allItemIds.length
    ? await queryInChunks(
        sb, "stops", "walklist_item_id, result, stop_at",
        "walklist_item_id", allItemIds,
        (q) => q.eq("tenant_id", tenant.id).order("created_at", { ascending: false })
      )
    : [];
  const lastResultByItemId = new Map<string, string>();
  for (const stop of allStops as any[]) {
    if (!lastResultByItemId.has(stop.walklist_item_id) && stop.result) {
      lastResultByItemId.set(stop.walklist_item_id, stop.result);
    }
  }
  const lastResultByPersonId = new Map<string, string>();
  const lastResultByLocationId = new Map<string, string>();
  const lastResultByCompanyId = new Map<string, string>();
  for (const item of allItems as any[]) {
    const result = lastResultByItemId.get(item.id);
    if (!result) continue;
    if (item.person_id) lastResultByPersonId.set(item.person_id, result);
    if (item.location_id) lastResultByLocationId.set(item.location_id, result);
    if (item.company_id) lastResultByCompanyId.set(item.company_id, result);
  }
  const colorMap = buildColorMap(resolveDispoConfig((tenant as any).settings ?? {}));

  // ── Shared enrichment: last contacted + opportunities (used by all paths) ─────
  // companyId → the person linked to that company item (for last-contacted + opp lookup)
  const companyPersonIdMap = new Map<string, string>();
  for (const item of allItems as any[]) {
    if (item.company_id && item.person_id && !companyPersonIdMap.has(item.company_id)) {
      companyPersonIdMap.set(item.company_id, item.person_id);
    }
  }
  const allEnrichedPersonIds = personIds; // already all person_ids from allItems
  const [personStops, opps] = await Promise.all([
    allEnrichedPersonIds.length
      ? queryInChunks(sb, "stops", "person_id,stop_at", "person_id", allEnrichedPersonIds,
          (q) => q.eq("tenant_id", tenant.id).order("stop_at", { ascending: false }))
      : Promise.resolve([]),
    allEnrichedPersonIds.length
      ? queryInChunks(sb, "opportunities", "contact_person_id,stage,title", "contact_person_id", allEnrichedPersonIds,
          (q) => q.eq("tenant_id", tenant.id))
      : Promise.resolve([]),
  ]);
  const lastContactedByPersonId = new Map<string, string>();
  for (const s of personStops as any[]) {
    if (!lastContactedByPersonId.has(s.person_id)) lastContactedByPersonId.set(s.person_id, s.stop_at);
  }
  const oppByPersonId = new Map((opps as any[]).map((o: any) => [o.contact_person_id, o]));

  // -------- COMPANIES PATH --------
  let companyRows: Array<Record<string, any>> = [];
  if (companyIds.length) {
    const cos = await queryInChunks(
      sb, "companies", "id,name,phone,email,location_id,status,industry", "id", companyIds
    );
    // Fetch addresses for companies via location_id
    const coLocIds = [...new Set((cos as any[]).map((c: any) => c.location_id).filter(Boolean) as string[])];
    const coLocs = coLocIds.length
      ? await queryInChunks(sb, "locations", "id,normalized_key,address_line1,city,state,postal_code", "id", coLocIds)
      : [];
    const coLocMap = new Map((coLocs as any[]).map((l: any) => [l.id, fmtAddr(l)]));

    companyRows = (cos as any[]).map((c: any) => {
      const result = lastResultByCompanyId.get(c.id);
      const personId = companyPersonIdMap.get(c.id);
      const opp = personId ? (oppByPersonId.get(personId) as any) : undefined;
      return {
        id: c.id,
        name: c.name ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        address: c.location_id ? (coLocMap.get(c.location_id) ?? "") : "",
        status: c.status ?? "",
        industry: c.industry ?? "",
        opp_stage: opp?.stage ?? "",
        last_contacted: personId ? fmtDate(lastContactedByPersonId.get(personId)) : "",
        _color: result ? colorMap[result] : undefined,
      };
    });
    if (q) {
      companyRows = companyRows.filter((r: any) =>
        [r.name, r.phone, r.email, r.address, r.status, r.industry, r.opp_stage]
          .some(v => v.toLowerCase().includes(q))
      );
    }
  }

  // -------- PEOPLE PATH (for call lists or if personIds exist) --------
  let peopleRows: Array<Record<string, any>> = [];
  let peopleResolved = 0;

  if (personIds.length || modeLower === "call" || modeLower === "text") {
    // Fetch all people by ID using chunked queries (bypasses PostgREST 1000-row cap)
    const ppl = await queryInChunks(
      sb, "people",
      "id,first_name,last_name,phone,phone_cell,phone_landline,email,party,likelihood_to_vote,contact_type,household_id",
      "id", personIds,
      (q) => q.eq("tenant_id", tenant.id)
    );

    // Batch fetch addresses: people.household_id → households → locations
    const hhIds = [...new Set((ppl as any[]).map((p: any) => p.household_id).filter(Boolean) as string[])];
    const pplHouseholds = hhIds.length
      ? await queryInChunks(sb, "households", "id,location_id", "id", hhIds, (q) => q.eq("tenant_id", tenant.id))
      : [];
    const hhLocMap = new Map((pplHouseholds as any[]).map((h: any) => [h.id, h.location_id]));
    const locIdsPpl = [...new Set((pplHouseholds as any[]).map((h: any) => h.location_id).filter(Boolean) as string[])];
    const pplLocs = locIdsPpl.length
      ? await queryInChunks(sb, "locations", "id,normalized_key,address_line1,city,state,postal_code", "id", locIdsPpl)
      : [];
    const locDetailMap = new Map((pplLocs as any[]).map((l: any) => [l.id, l]));

    const addressByPersonId = new Map<string, string>();
    for (const p of ppl as any[]) {
      if (!p.household_id) continue;
      const locId = hhLocMap.get(p.household_id);
      if (!locId) continue;
      const loc = locDetailMap.get(locId);
      if (loc) addressByPersonId.set(p.id, fmtAddr(loc));
    }

    // hasPartyData / hasOppData drive dynamic column visibility
    const hasPartyData = (ppl as any[]).some((p: any) => p.party || p.likelihood_to_vote != null);
    const hasOppData = oppByPersonId.size > 0;

    peopleRows = (ppl as any[]).map((p: any) => {
      const result = lastResultByPersonId.get(p.id);
      const opp = oppByPersonId.get(p.id) as any;
      return {
        id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        phone: p.phone_cell ? `C: ${p.phone_cell}` : p.phone_landline ? `L: ${p.phone_landline}` : (p.phone ?? ""),
        email: p.email ?? "",
        address: addressByPersonId.get(p.id) ?? "",
        contact_type: p.contact_type ?? "",
        party: p.party ?? "",
        likelihood: p.likelihood_to_vote != null ? `${p.likelihood_to_vote}%` : "",
        opp_stage: opp?.stage ?? "",
        last_contacted: fmtDate(lastContactedByPersonId.get(p.id)),
        _hasPartyData: hasPartyData,
        _hasOppData: hasOppData,
        _color: result ? colorMap[result] : undefined,
      };
    });
    peopleResolved = peopleRows.length;

    // Fallback: placeholders if RLS is blocking
    if (!peopleRows.length && personIds.length) {
      peopleRows = personIds.map(id => ({
        id, name: "(unavailable due to access policy)",
        phone: "", email: "", address: "", contact_type: "",
        party: "", likelihood: "", opp_stage: "", last_contacted: "",
        _hasPartyData: false, _hasOppData: false,
      }));
    }
  }

  // Apply ?q= filter for people
  const filterLike = (s: string) => s.toLowerCase().includes(q);
  if (q) {
    peopleRows = peopleRows.filter(
      r => filterLike(r.name) || filterLike(r.phone) || filterLike(r.email) ||
           filterLike(r.address) || filterLike(r.party) || filterLike(r.opp_stage) ||
           filterLike(r.contact_type)
    );
  }

  // -------- LOCATIONS PATH (default if not call) --------
  let locationRows: Array<Record<string, any>> = [];
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

      // Global last_contacted per household (across all channels)
      const hhStops = hhIds2.length
        ? await queryInChunks(sb, "stops", "household_id,stop_at", "household_id", hhIds2,
            (q) => q.eq("tenant_id", tenant.id).order("stop_at", { ascending: false }))
        : [];
      const lastContactedByHhId = new Map<string, string>();
      for (const s of hhStops as any[]) {
        if (!lastContactedByHhId.has(s.household_id)) lastContactedByHhId.set(s.household_id, s.stop_at);
      }

      if (hhIds2.length) {
        const addPerson = (locId: string, p: any) => {
          const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          if (!name) return;
          const arr = peopleByLocId.get(locId) ?? [];
          if (!arr.some(x => x.name === name)) {
            const phone = p.phone_cell ? `C: ${p.phone_cell}` : p.phone_landline ? `L: ${p.phone_landline}` : (p.phone ?? "");
            arr.push({ name, phone });
          }
          peopleByLocId.set(locId, arr);
        };

        // Style A: direct people.household_id (chunked)
        const directPeople = await queryInChunks(
          sb,
          "people",
          "first_name, last_name, phone, phone_cell, phone_landline, household_id",
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
            "id, first_name, last_name, phone, phone_cell, phone_landline",
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
        const result = lastResultByLocationId.get(r.id);
        return {
          id: locToHhId.get(r.id) ?? r.id,
          address: r.address,
          name: people.map((p: any) => p.name).filter(Boolean).join(", "),
          phone: people.map((p: any) => p.phone).filter(Boolean).join(", "),
          last_contacted: fmtDate(lastContactedByHhId.get(locToHhId.get(r.id) ?? "")),
          _color: result ? colorMap[result] : undefined,
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
  const hasCompanyIds = companyIds.length > 0;

  // Map list mode → active_channels key so we only show surveys enabled for that deployment
  const modeToChannel: Record<string, string> = { door: "doors", call: "dials", text: "texts" };
  const listChannel = modeToChannel[modeLower] ?? null;
  const eligibleSurveys = allSurveys.filter((s) => {
    if (!listChannel) return true; // unknown mode — show all
    if (!s.active_channels || s.active_channels.length === 0) return s.active; // fallback for unset
    return s.active_channels.includes(listChannel as any);
  });

  const surveyPanel = (
    <SurveyAssignmentPanel
      listId={params.id}
      currentSurveyId={(meta as ListMeta).survey_id ?? null}
      currentCaptureMode={(meta as ListMeta).call_capture_mode ?? null}
      surveys={eligibleSurveys.map((s) => ({ id: s.id, title: s.title }))}
    />
  );

  // Companies-only list
  if (hasCompanyIds && !hasPeopleIds && !hasLocationIds) {
    return (
      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>{titleBase} — Companies</h1>
          <PeopleSearch placeholder="Search companies in this list…" />
        </div>
        {surveyPanel}
        {(() => {
          const hasCoOpp = companyRows.some((r: any) => r.opp_stage);
          const coCols = [
            { key: "name",          label: "Company",      width: 220 },
            { key: "phone",         label: "Phone",        width: 140 },
            { key: "email",         label: "Email",        width: 190 },
            { key: "address",       label: "Address",      width: 220 },
            { key: "industry",      label: "Industry",     width: 120 },
            { key: "status",        label: "Status",       width: 90  },
            ...(hasCoOpp ? [{ key: "opp_stage", label: "Opp Stage", width: 110 }] : []),
            { key: "last_contacted", label: "Last Contact", width: 120 },
          ];
          return (
            <ListPage
              title=""
              rowHrefPrefix="/crm/companies/"
              columns={coCols}
              rows={companyRows}
              rowColorKey="_color"
            />
          );
        })()}
      </section>
    );
  }

  // People list (call / text / mixed)
  if (hasPeopleIds || hasCompanyIds || modeLower === "call" || modeLower === "text") {
    const isText = modeLower === "text";
    const subtitle = isText
      ? "Text List"
      : hasPeopleVisible
        ? "People"
        : hasPeopleIds
        ? "People (some items hidden by access policy)"
        : "People";
    return (
      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>{titleBase} — {subtitle}</h1>
          <PeopleSearch placeholder={isText ? "Search text list…" : "Search people in this list…"} />
        </div>
        {surveyPanel}
        {peopleRows.length > 0 && (() => {
          const firstRow = peopleRows[0] as any;
          const showParty = firstRow?._hasPartyData ?? false;
          const showOpp = firstRow?._hasOppData ?? false;
          const cols = [
            { key: "name",          label: "Name",         width: 200 },
            { key: "phone",         label: "Phone",        width: 140 },
            { key: "email",         label: "Email",        width: 190 },
            { key: "address",       label: "Address",      width: 220 },
            { key: "contact_type",  label: "Type",         width: 90  },
            ...(showParty ? [
              { key: "party",       label: "Party",        width: 70  },
              { key: "likelihood",  label: "Vote %",       width: 70  },
            ] : []),
            ...(showOpp ? [
              { key: "opp_stage",   label: "Opp Stage",    width: 110 },
            ] : []),
            { key: "last_contacted", label: "Last Contact", width: 120 },
          ];
          return (
            <ListPage
              title={hasCompanyIds ? "People" : ""}
              rowHrefPrefix="/crm/people/"
              columns={cols}
              rows={peopleRows}
              rowColorKey="_color"
            />
          );
        })()}
        {companyRows.length > 0 && (() => {
          const hasCoOpp = companyRows.some((r: any) => r.opp_stage);
          const coCols = [
            { key: "name",          label: "Company",      width: 200 },
            { key: "phone",         label: "Phone",        width: 140 },
            { key: "email",         label: "Email",        width: 180 },
            { key: "address",       label: "Address",      width: 200 },
            { key: "industry",      label: "Industry",     width: 110 },
            { key: "status",        label: "Status",       width: 90  },
            ...(hasCoOpp ? [{ key: "opp_stage", label: "Opp Stage", width: 110 }] : []),
            { key: "last_contacted", label: "Last Contact", width: 120 },
          ];
          return (
            <ListPage
              title="Companies"
              rowHrefPrefix="/crm/companies/"
              columns={coCols}
              rows={companyRows}
              rowColorKey="_color"
            />
          );
        })()}
      </section>
    );
  }

  // Locations list
  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{titleBase} — Locations</h1>
        <PeopleSearch placeholder="Search locations in this list…" />
      </div>
      {surveyPanel}
      <ListPage
        title=""
        rowHrefPrefix="/crm/households/"
        columns={[
          { key: "address",        label: "Address",      width: 300 },
          { key: "name",           label: "Name",         width: 200 },
          { key: "phone",          label: "Phone",        width: 150 },
          { key: "last_contacted", label: "Last Contact", width: 120 },
        ]}
        rows={locationRows}
        rowColorKey="_color"
      />
    </section>
  );
}


