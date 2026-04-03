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
    // ── Phase 1: find dup group IDs via a single server-side SQL query ──────
    // The RPC does GROUP BY in Postgres — no need to stream 200K rows over HTTP.
    // Run the data fetch and the total-group count in parallel.
    const [
      { data: groupRows, error: rpcError },
      { count: totalGroups },
    ] = await Promise.all([
      sb.rpc("find_dup_people", { p_tenant_id: tenant.id }),
      sb.rpc("find_dup_people", { p_tenant_id: tenant.id }, { count: "exact", head: true }),
    ]);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    if (!groupRows?.length) return NextResponse.json({ groups: [], total: 0, totalGroups: 0 });

    // Each row: { group_key: string, person_ids: string[] }
    const allDupIds = [...new Set((groupRows as any[]).flatMap((r) => r.person_ids as string[]))];

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
    const allCandidateGroups: [string, any[]][] = (groupRows as any[]).map((r) => [
      r.group_key as string,
      (r.person_ids as string[]).map((id) => fullPeopleMap.get(id)).filter(Boolean),
    ]);
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
    return NextResponse.json({ groups: dupGroups, total, totalGroups: totalGroups ?? dupGroups.length });
  }

  // ── Household duplicates ──────────────────────────────────────────────────
  if (type === "households") {
    const [{ data: groupRows, error: rpcError }, { count: totalGroups }] = await Promise.all([
      sb.rpc("find_dup_households", { p_tenant_id: tenant.id }),
      sb.rpc("find_dup_households", { p_tenant_id: tenant.id }, { count: "exact", head: true }),
    ]);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    if (!groupRows?.length) return NextResponse.json({ groups: [], total: 0, totalGroups: 0 });

    const allDupIds = [...new Set((groupRows as any[]).flatMap((r) => r.household_ids as string[]))];

    const hhMap = new Map<string, any>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb.from("households").select("id, name, location_id").in("id", allDupIds.slice(i, i + 200));
      for (const h of data ?? []) hhMap.set(h.id, h);
    }

    const locIds = [...new Set([...hhMap.values()].map((h) => h.location_id).filter(Boolean))];
    const addrByLocId = new Map<string, string>();
    for (let i = 0; i < locIds.length; i += 200) {
      const { data } = await sb.from("locations").select("id, address_line1, city, state, postal_code").in("id", locIds.slice(i, i + 200));
      for (const l of data ?? []) addrByLocId.set(l.id, [l.address_line1, l.city, l.state, l.postal_code].filter(Boolean).join(", "));
    }

    const countByHhId = new Map<string, number>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb.from("people").select("household_id").eq("tenant_id", tenant.id).in("household_id", allDupIds.slice(i, i + 200));
      for (const p of data ?? []) if (p.household_id) countByHhId.set(p.household_id, (countByHhId.get(p.household_id) ?? 0) + 1);
    }

    const dupGroups = (groupRows as any[]).map((r) => {
      const recs = (r.household_ids as string[]).map((id) => hhMap.get(id)).filter(Boolean);
      const sorted = [...recs].sort((a, b) => (countByHhId.get(b.id) ?? 0) - (countByHhId.get(a.id) ?? 0));
      const addr = addrByLocId.get(sorted[0]?.location_id) ?? r.group_key;
      return {
        key: r.group_key as string,
        label: addr,
        suggestedKeepId: sorted[0]?.id,
        records: sorted.map((hh: any) => ({
          id: hh.id,
          name: hh.name ?? "",
          location_id: hh.location_id ?? null,
          address: addrByLocId.get(hh.location_id) ?? "",
          people_count: countByHhId.get(hh.id) ?? 0,
        })),
      };
    }).filter((g) => g.records.length > 1).sort((a, b) => b.records.length - a.records.length);

    const total = dupGroups.reduce((s: number, g: any) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total, totalGroups: totalGroups ?? dupGroups.length });
  }

  // ── Company duplicates ────────────────────────────────────────────────────
  if (type === "companies") {
    const [{ data: groupRows, error: rpcError }, { count: totalGroups }] = await Promise.all([
      sb.rpc("find_dup_companies", { p_tenant_id: tenant.id }),
      sb.rpc("find_dup_companies", { p_tenant_id: tenant.id }, { count: "exact", head: true }),
    ]);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    if (!groupRows?.length) return NextResponse.json({ groups: [], total: 0, totalGroups: 0 });

    const allDupIds = [...new Set((groupRows as any[]).flatMap((r) => r.company_ids as string[]))];
    const coMap = new Map<string, any>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb.from("companies").select("id, name, domain, phone, email, industry, status, location_id").in("id", allDupIds.slice(i, i + 200));
      for (const c of data ?? []) coMap.set(c.id, c);
    }

    const locIds = [...new Set([...coMap.values()].map((c) => c.location_id).filter(Boolean))];
    const addrByLocId = new Map<string, string>();
    for (let i = 0; i < locIds.length; i += 200) {
      const { data } = await sb.from("locations").select("id, address_line1, city, state, postal_code").in("id", locIds.slice(i, i + 200));
      for (const l of data ?? []) addrByLocId.set(l.id, [l.address_line1, l.city, l.state, l.postal_code].filter(Boolean).join(", "));
    }

    function scoreCompany(c: any) {
      return [c.name, c.domain, c.phone, c.email, c.industry, c.location_id].filter(Boolean).length;
    }

    const dupGroups = (groupRows as any[]).map((r) => {
      const recs = (r.company_ids as string[]).map((id) => coMap.get(id)).filter(Boolean);
      const sorted = [...recs].sort((a, b) => scoreCompany(b) - scoreCompany(a));
      return {
        key: r.group_key as string,
        label: sorted[0]?.name ?? r.group_key,
        suggestedKeepId: sorted[0]?.id,
        records: sorted.map((c: any) => ({
          id: c.id, name: c.name ?? "", domain: c.domain ?? "", phone: c.phone ?? "",
          email: c.email ?? "", industry: c.industry ?? "", status: c.status ?? "",
          address: addrByLocId.get(c.location_id) ?? "",
        })),
      };
    }).filter((g) => g.records.length > 1).sort((a, b) => b.records.length - a.records.length);

    const total = dupGroups.reduce((s: number, g: any) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total, totalGroups: totalGroups ?? dupGroups.length });
  }

  // ── Location duplicates ───────────────────────────────────────────────────
  if (type === "locations") {
    const [{ data: groupRows, error: rpcError }, { count: totalGroups }] = await Promise.all([
      sb.rpc("find_dup_locations", { p_tenant_id: tenant.id }),
      sb.rpc("find_dup_locations", { p_tenant_id: tenant.id }, { count: "exact", head: true }),
    ]);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    if (!groupRows?.length) return NextResponse.json({ groups: [], total: 0, totalGroups: 0 });

    const allDupIds = [...new Set((groupRows as any[]).flatMap((r) => r.location_ids as string[]))];
    const locMap = new Map<string, any>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb.from("locations").select("id, address_line1, city, state, postal_code, lat, lon, geocode_failed, normalized_key").in("id", allDupIds.slice(i, i + 200));
      for (const l of data ?? []) locMap.set(l.id, l);
    }

    function scoreLoc(l: any) {
      let s = [l.address_line1, l.city, l.state, l.postal_code, l.normalized_key].filter(Boolean).length;
      if (l.lat != null && l.lon != null) s += 3;
      return s;
    }

    const dupGroups = (groupRows as any[]).map((r) => {
      const recs = (r.location_ids as string[]).map((id) => locMap.get(id)).filter(Boolean);
      const sorted = [...recs].sort((a, b) => scoreLoc(b) - scoreLoc(a));
      const first = sorted[0];
      return {
        key: r.group_key as string,
        label: [first?.address_line1, first?.city, first?.state].filter(Boolean).join(", ") || r.group_key,
        suggestedKeepId: first?.id,
        records: sorted.map((l: any) => ({
          id: l.id, address_line1: l.address_line1 ?? "", city: l.city ?? "",
          state: l.state ?? "", postal_code: l.postal_code ?? "",
          has_coords: l.lat != null && l.lon != null,
          normalized_key: l.normalized_key ?? "",
        })),
      };
    }).filter((g) => g.records.length > 1).sort((a, b) => b.records.length - a.records.length);

    const total = dupGroups.reduce((s: number, g: any) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total, totalGroups: totalGroups ?? dupGroups.length });
  }

  // ── Opportunity duplicates ────────────────────────────────────────────────
  if (type === "opportunities") {
    const [{ data: groupRows, error: rpcError }, { count: totalGroups }] = await Promise.all([
      sb.rpc("find_dup_opportunities", { p_tenant_id: tenant.id }),
      sb.rpc("find_dup_opportunities", { p_tenant_id: tenant.id }, { count: "exact", head: true }),
    ]);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    if (!groupRows?.length) return NextResponse.json({ groups: [], total: 0, totalGroups: 0 });

    const allDupIds = [...new Set((groupRows as any[]).flatMap((r) => r.opportunity_ids as string[]))];
    const oppMap = new Map<string, any>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb.from("opportunities").select("id, title, stage, amount_cents, priority, due_at, source, contact_person_id, created_at, updated_at").in("id", allDupIds.slice(i, i + 200));
      for (const o of data ?? []) oppMap.set(o.id, o);
    }

    const stageOrder: Record<string, number> = { won: 6, proposal: 5, qualified: 4, contacted: 3, new: 2 };
    function scoreOpp(o: any) {
      return (stageOrder[o.stage] ?? 1) * 1000 + new Date(o.updated_at ?? 0).getTime() / 1e12;
    }

    // Resolve contact person names
    const personIds = [...new Set([...oppMap.values()].map((o) => o.contact_person_id).filter(Boolean))];
    const personNameById = new Map<string, string>();
    for (let i = 0; i < personIds.length; i += 200) {
      const { data } = await sb.from("people").select("id, first_name, last_name").in("id", personIds.slice(i, i + 200));
      for (const p of data ?? []) personNameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" "));
    }

    const dupGroups = (groupRows as any[]).map((r) => {
      const recs = (r.opportunity_ids as string[]).map((id) => oppMap.get(id)).filter(Boolean);
      const sorted = [...recs].sort((a, b) => scoreOpp(b) - scoreOpp(a));
      return {
        key: r.group_key as string,
        label: sorted[0]?.title ?? r.group_key,
        suggestedKeepId: sorted[0]?.id,
        records: sorted.map((o: any) => ({
          id: o.id, title: o.title ?? "", stage: o.stage ?? "",
          amount_cents: o.amount_cents ?? null, priority: o.priority ?? "",
          due_at: o.due_at ?? "", source: o.source ?? "",
          contact_person_id: o.contact_person_id ?? null,
          person_name: personNameById.get(o.contact_person_id) ?? "",
        })),
      };
    }).filter((g) => g.records.length > 1).sort((a, b) => b.records.length - a.records.length);

    const total = dupGroups.reduce((s: number, g: any) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total, totalGroups: totalGroups ?? dupGroups.length });
  }

  // ── Stop duplicates ───────────────────────────────────────────────────────
  if (type === "stops") {
    const [{ data: groupRows, error: rpcError }, { count: totalGroups }] = await Promise.all([
      sb.rpc("find_dup_stops", { p_tenant_id: tenant.id }),
      sb.rpc("find_dup_stops", { p_tenant_id: tenant.id }, { count: "exact", head: true }),
    ]);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    if (!groupRows?.length) return NextResponse.json({ groups: [], total: 0, totalGroups: 0 });

    const allDupIds = [...new Set((groupRows as any[]).flatMap((r) => r.stop_ids as string[]))];
    const stopMap = new Map<string, any>();
    for (let i = 0; i < allDupIds.length; i += 200) {
      const { data } = await sb.from("stops").select("id, stop_at, channel, result, notes, duration_sec, person_id").in("id", allDupIds.slice(i, i + 200));
      for (const s of data ?? []) stopMap.set(s.id, s);
    }

    const personIds = [...new Set([...stopMap.values()].map((s) => s.person_id).filter(Boolean))];
    const personNameById = new Map<string, string>();
    for (let i = 0; i < personIds.length; i += 200) {
      const { data } = await sb.from("people").select("id, first_name, last_name").in("id", personIds.slice(i, i + 200));
      for (const p of data ?? []) personNameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" "));
    }

    const dupGroups = (groupRows as any[]).map((r) => {
      const recs = (r.stop_ids as string[]).map((id) => stopMap.get(id)).filter(Boolean);
      // Sort earliest first — keep the original
      const sorted = [...recs].sort((a, b) => new Date(a.stop_at).getTime() - new Date(b.stop_at).getTime());
      const first = sorted[0];
      return {
        key: r.group_key as string,
        label: `${personNameById.get(first?.person_id) ?? "Unknown"} — ${first?.channel ?? ""} @ ${first?.stop_at ? new Date(first.stop_at).toLocaleDateString() : ""}`,
        suggestedKeepId: first?.id,
        records: sorted.map((s: any) => ({
          id: s.id, stop_at: s.stop_at ?? "", channel: s.channel ?? "",
          result: s.result ?? "", notes: s.notes ?? "",
          duration_sec: s.duration_sec ?? null,
          person_id: s.person_id ?? null,
          person_name: personNameById.get(s.person_id) ?? "",
        })),
      };
    }).filter((g) => g.records.length > 1).sort((a, b) => b.records.length - a.records.length);

    const total = dupGroups.reduce((s: number, g: any) => s + g.records.length - 1, 0);
    return NextResponse.json({ groups: dupGroups, total, totalGroups: totalGroups ?? dupGroups.length });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
