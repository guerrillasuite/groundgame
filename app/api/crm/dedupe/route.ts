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

// Paginate through all rows to bypass PostgREST's max_rows cap
async function fetchAll(buildQuery: () => any, chunkSize = 2000): Promise<any[]> {
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
    let people: any[];
    try {
      people = await fetchAll(() =>
        sb
          .from("people")
          .select("id, first_name, last_name, email, phone, phone_cell, phone_landline, contact_type, household_id, lalvoteid, birth_date, gender, tenant_people!inner(tenant_id)")
          .eq("tenant_people.tenant_id", tenant.id)
          .order("last_name")
          .order("first_name")
      );
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }

    // Pass 1 — records WITH a lalvoteid: bucket by voter ID (definite identity match)
    // Records with DIFFERENT lalvoteids are different people even if name is identical
    const lalvoteidGroups = new Map<string, any[]>();
    const noLalvoteid: any[] = [];
    for (const p of people ?? []) {
      const lid = (p.lalvoteid ?? "").trim();
      if (lid) {
        if (!lalvoteidGroups.has(lid)) lalvoteidGroups.set(lid, []);
        lalvoteidGroups.get(lid)!.push(p);
      } else {
        noLalvoteid.push(p);
      }
    }

    // Pass 2 — records WITHOUT lalvoteid: group by normalized name
    const nameGroups = new Map<string, any[]>();
    for (const p of noLalvoteid) {
      const key = `${(p.first_name ?? "").trim().toLowerCase()}|${(p.last_name ?? "").trim().toLowerCase()}`;
      if (!key || key === "|") continue;
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key)!.push(p);
    }

    // Combine — only groups with 2+ records are actual duplicates
    const allCandidateGroups: [string, any[]][] = [
      ...[...lalvoteidGroups.entries()].map(([k, v]) => [`lid:${k}`, v] as [string, any[]]),
      ...[...nameGroups.entries()].map(([k, v]) => [`name:${k}`, v] as [string, any[]]),
    ];
    const dupCandidates = allCandidateGroups.filter(([, recs]) => recs.length > 1);

    // Collect household_ids from all candidate records for address lookup
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
