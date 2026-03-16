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

function scoreRecord(r: Record<string, any>): number {
  // Higher score = more data filled in → preferred as "keep" candidate
  return [r.email, r.phone, r.contact_type, r.household_id].filter(Boolean).length;
}

export async function GET(request: Request) {
  const tenant = await getTenant();

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "people";

  const sb = makeSb(tenant.id);

  // ── People duplicates ─────────────────────────────────────────────────────
  if (type === "people") {
    const { data: people, error } = await sb
      .from("people")
      .select("id, first_name, last_name, email, phone, contact_type, household_id")
      .eq("tenant_id", tenant.id)
      .order("last_name")
      .order("first_name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by normalized name
    const groups = new Map<string, typeof people>();
    for (const p of people ?? []) {
      const key = `${(p.first_name ?? "").trim().toLowerCase()}|${(p.last_name ?? "").trim().toLowerCase()}`;
      if (!key || key === "|") continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    // Collect household_ids to resolve addresses
    const hhIds = [...new Set(
      [...groups.values()].flat().map((p) => p.household_id).filter(Boolean) as string[]
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

    const dupGroups = [...groups.entries()]
      .filter(([, recs]) => recs.length > 1)
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
            contact_type: p.contact_type ?? "",
            household_id: p.household_id ?? null,
            address: p.household_id ? (addrByHhId.get(p.household_id) ?? "") : "",
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
