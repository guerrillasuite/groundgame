import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// Paginate through all rows to bypass PostgREST's max_rows cap (default 1000).
// chunkSize MUST match or be below PostgREST's cap — if the server returns fewer
// rows than requested, the loop assumes it has reached the end and stops.
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

function scoreRecord(r: Record<string, any>): number {
  // Higher score = more data filled in → preferred as "keep" candidate
  // lalvoteid is worth 3 points — canonical voter file identifier
  let score = [r.email, r.phone, r.phone_cell, r.phone_landline, r.contact_type, r.household_id].filter(Boolean).length;
  if (r.lalvoteid) score += 3;
  return score;
}

export async function GET(request: Request) {
  const tenant = await getTenant();

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "people";

  const sb = makeSb(tenant.id);

  // ── People duplicates ─────────────────────────────────────────────────────
  if (type === "people") {
    // ── Phase 1: scan ALL people with minimal columns ──────────────────────
    // Fetch only 4 small columns (vs 13) to find dup group IDs cheaply.
    // fetchAll paginates in 1000-row chunks — must match PostgREST's max_rows cap.
    let slim: any[];
    try {
      slim = await fetchAll(() =>
        sb
          .from("people")
          .select("id, first_name, last_name, lalvoteid, tenant_people!inner(tenant_id)")
          .eq("tenant_people.tenant_id", tenant.id)
          .order("last_name")
          .order("first_name")
      );
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }

    // ── Find dup groups from slim data ────────────────────────────────────
    // Pass 1: lalvoteid buckets (definite identity — different IDs = different people)
    const lalvoteidGroupIds = new Map<string, string[]>();
    const noLalvoteid: any[] = [];
    for (const p of slim) {
      const lid = (p.lalvoteid ?? "").trim();
      if (lid) {
        if (!lalvoteidGroupIds.has(lid)) lalvoteidGroupIds.set(lid, []);
        lalvoteidGroupIds.get(lid)!.push(p.id);
      } else {
        noLalvoteid.push(p);
      }
    }
    // Pass 2: name buckets for records without lalvoteid
    const nameGroupIds = new Map<string, string[]>();
    for (const p of noLalvoteid) {
      const key = `${(p.first_name ?? "").trim().toLowerCase()}|${(p.last_name ?? "").trim().toLowerCase()}`;
      if (!key || key === "|") continue;
      if (!nameGroupIds.has(key)) nameGroupIds.set(key, []);
      nameGroupIds.get(key)!.push(p.id);
    }

    const dupLalvoteids = [...lalvoteidGroupIds.entries()].filter(([, ids]) => ids.length > 1);
    const dupNames = [...nameGroupIds.entries()].filter(([, ids]) => ids.length > 1);
    const allDupIds = [...new Set([
      ...dupLalvoteids.flatMap(([, ids]) => ids),
      ...dupNames.flatMap(([, ids]) => ids),
    ])];

    if (allDupIds.length === 0) return NextResponse.json({ groups: [], total: 0 });

    // ── Phase 2: fetch full details only for the dup IDs ──────────────────
    const fullPeopleMap = new Map<string, any>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb
        .from("people")
        .select("id, first_name, last_name, email, phone, phone_cell, phone_landline, contact_type, household_id, lalvoteid, birth_date, gender")
        .in("id", allDupIds.slice(i, i + 200));
      for (const p of data ?? []) fullPeopleMap.set(p.id, p);
    }

    // Rebuild groups with full-detail records
    const allCandidateGroups: [string, any[]][] = [
      ...dupLalvoteids.map(([k, ids]) => [`lid:${k}`, ids.map(id => fullPeopleMap.get(id)).filter(Boolean)] as [string, any[]]),
      ...dupNames.map(([k, ids]) => [`name:${k}`, ids.map(id => fullPeopleMap.get(id)).filter(Boolean)] as [string, any[]]),
    ];
    const dupCandidates = allCandidateGroups.filter(([, recs]) => recs.length > 1);

    const allCandidatePeople = dupCandidates.flatMap(([, recs]) => recs);
    const hhIds = [...new Set(
      allCandidatePeople.map((p) => p.household_id).filter(Boolean) as string[]
    )];

    const addrByHhId = new Map<string, string>();
    if (hhIds.length > 0) {
      const { data: hhs } = await sb
        .from("households")
        .select("id, location_id")
        .eq("tenant_id", tenant.id)
        .in("id", hhIds);

      const locIds = [...new Set((hhs ?? []).map((h: any) => h.location_id).filter(Boolean))];
      if (locIds.length > 0) {
        const { data: locs } = await sb
          .from("locations")
          .select("id, address_line1, city, state")
          .in("id", locIds);

        const addrByLocId = new Map<string, string>();
        for (const loc of locs ?? []) {
          addrByLocId.set(loc.id, [loc.address_line1, loc.city, loc.state].filter(Boolean).join(", "));
        }
        for (const hh of hhs ?? []) {
          if (hh.location_id) addrByHhId.set(hh.id, addrByLocId.get(hh.location_id) ?? "");
        }
      }
    }

    // Junction-table address fallback for people without a direct household_id
    const personIdsNeedingHH = allCandidatePeople
      .filter((p) => !p.household_id)
      .map((p) => p.id as string);

    const addrByPersonId = new Map<string, string>();
    if (personIdsNeedingHH.length > 0) {
      const phRows: any[] = [];
      for (let i = 0; i < personIdsNeedingHH.length; i += 200) {
        const { data } = await sb
          .from("person_households")
          .select("person_id, household_id")
          .in("person_id", personIdsNeedingHH.slice(i, i + 200));
        if (data) phRows.push(...data);
      }
      // Fetch any households not already resolved
      const newHhIds = [...new Set(phRows.map((r) => r.household_id).filter(Boolean) as string[])]
        .filter((id) => !addrByHhId.has(id));
      if (newHhIds.length > 0) {
        const { data: newHhs } = await sb
          .from("households")
          .select("id, location_id")
          .in("id", newHhIds);
        const newLocIds = [...new Set((newHhs ?? []).map((h: any) => h.location_id).filter(Boolean) as string[])];
        if (newLocIds.length > 0) {
          const { data: newLocs } = await sb
            .from("locations")
            .select("id, address_line1, city, state")
            .in("id", newLocIds);
          const newAddrByLocId = new Map<string, string>();
          for (const loc of newLocs ?? []) {
            newAddrByLocId.set(loc.id, [loc.address_line1, loc.city, loc.state].filter(Boolean).join(", "));
          }
          for (const hh of newHhs ?? []) {
            if (hh.location_id) addrByHhId.set(hh.id, newAddrByLocId.get(hh.location_id) ?? "");
          }
        }
      }
      for (const row of phRows) {
        if (row.household_id) {
          addrByPersonId.set(row.person_id, addrByHhId.get(row.household_id) ?? "");
        }
      }
    }

    const dupGroups = dupCandidates
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, recs]) => {
        const sorted = [...recs].sort((a, b) => scoreRecord(b) - scoreRecord(a));
        const first = sorted[0];
        const label = [first.first_name, first.last_name].filter(Boolean).join(" ") || key;
        return {
          key,
          label,
          suggestedKeepId: sorted[0].id,
          records: sorted.map((p) => ({
            id: p.id,
            first_name: p.first_name ?? "",
            last_name: p.last_name ?? "",
            email: p.email ?? "",
            phone: p.phone ?? "",
            phone_cell: p.phone_cell ?? "",
            phone_landline: p.phone_landline ?? "",
            contact_type: p.contact_type ?? "",
            lalvoteid: p.lalvoteid ?? "",
            birth_date: p.birth_date ?? "",
            gender: p.gender ?? "",
            household_id: p.household_id ?? null,
            address: p.household_id
              ? (addrByHhId.get(p.household_id) ?? addrByPersonId.get(p.id) ?? "")
              : (addrByPersonId.get(p.id) ?? ""),
          })),
        };
      });

    const total = dupGroups.reduce((s, g) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total });
  }

  // ── Household duplicates ──────────────────────────────────────────────────
  if (type === "households") {
    const { data: households, error } = await sb
      .from("households")
      .select("id, location_id, name")
      .eq("tenant_id", tenant.id)
      .not("location_id", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by location_id
    const groups = new Map<string, typeof households>();
    for (const hh of households ?? []) {
      if (!hh.location_id) continue;
      if (!groups.has(hh.location_id)) groups.set(hh.location_id, []);
      groups.get(hh.location_id)!.push(hh);
    }

    const dupLocIds = [...groups.keys()].filter((k) => groups.get(k)!.length > 1);
    if (dupLocIds.length === 0) return NextResponse.json({ groups: [], total: 0 });

    // Resolve location addresses
    const { data: locs } = await sb
      .from("locations")
      .select("id, address_line1, city, state, postal_code")
      .in("id", dupLocIds);

    const addrByLocId = new Map<string, string>();
    for (const loc of locs ?? []) {
      addrByLocId.set(loc.id, [loc.address_line1, loc.city, loc.state, loc.postal_code].filter(Boolean).join(", "));
    }

    // Count people per household
    const allHhIds = [...groups.values()].flat().map((h: any) => h.id);
    const { data: peopleCounts } = await sb
      .from("people")
      .select("household_id")
      .eq("tenant_id", tenant.id)
      .in("household_id", allHhIds);

    const countByHhId = new Map<string, number>();
    for (const p of peopleCounts ?? []) {
      if (p.household_id) countByHhId.set(p.household_id, (countByHhId.get(p.household_id) ?? 0) + 1);
    }

    const dupGroups = dupLocIds
      .map((locId) => {
        const recs = groups.get(locId)!;
        // Prefer household with most people as primary
        const sorted = [...recs].sort((a, b) => (countByHhId.get(b.id) ?? 0) - (countByHhId.get(a.id) ?? 0));
        return {
          key: locId,
          label: addrByLocId.get(locId) ?? locId,
          suggestedKeepId: sorted[0].id,
          records: sorted.map((hh) => ({
            id: hh.id,
            name: hh.name ?? "",
            location_id: hh.location_id,
            address: addrByLocId.get(locId) ?? "",
            people_count: countByHhId.get(hh.id) ?? 0,
          })),
        };
      })
      .sort((a, b) => b.records.length - a.records.length);

    const total = dupGroups.reduce((s, g) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
