import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// Supabase PostgREST caps rows at max_rows (default 1000).
// Loop with .range() to fetch everything.
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

export type FilterOp =
  | "contains"
  | "equals"
  | "starts_with"
  | "not_contains"
  | "is_empty"
  | "not_empty"
  | "greater_than"
  | "gte"
  | "less_than"
  | "lte"
  | "is_true"
  | "is_false"
  | "in_list"
  | "not_in_list";

export type SearchFilter = { field: string; op: FilterOp; value: string; data_type?: string };
export type SearchTarget = "people" | "households" | "locations" | "companies";

// Fields that live on the locations table, resolved via join for people/households searches.
// Any field NOT in this set is treated as a direct column on the people/households table.
const LOCATION_JOIN_FIELDS = new Set([
  // Core address
  "city", "state", "postal_code", "address", "address_line1", "unit",
  // GIS address components
  "house_number", "pre_dir", "street_name", "street_suffix", "post_dir",
  "postal_community", "parcel_id", "full_address",
  // Other location columns
  "subdivision", "land_use", "type", "common_place_name", "place_name",
  "postal_city", "council_district", "is_residential",
  // Districts + geo
  "congressional_district", "state_senate_district", "state_house_district",
  "state_legislative_district", "precinct", "county_name", "municipality",
  "municipal_subdistrict", "county_commission_district", "county_supervisor_district",
  "school_district", "college_district", "judicial_district", "fips_code",
  "urbanicity", "population_density", "time_zone",
  "census_tract", "census_block_group", "census_block", "dma",
]);

// "address" is a virtual alias → maps to address_line1 in the DB
function resolveCol(field: string): string {
  return field === "address" ? "address_line1" : field;
}

const NUMERIC_TYPES = new Set([
  "integer", "int", "int2", "int4", "int8",
  "bigint", "smallint", "numeric", "decimal",
  "real", "float4", "float8", "double precision",
]);

function applyFilter(query: any, col: string, op: FilterOp, value: string, data_type?: string) {
  const numeric = data_type ? NUMERIC_TYPES.has(data_type) : false;
  switch (op) {
    case "contains":
      return query.ilike(col, `%${value}%`);
    case "equals":
      return numeric ? query.eq(col, value) : query.ilike(col, value);
    case "starts_with":
      return query.ilike(col, `${value}%`);
    case "not_contains":
      return query.not(col, "ilike", `%${value}%`);
    case "is_empty":
      return numeric ? query.is(col, null) : query.or(`${col}.is.null,${col}.eq.`);
    case "not_empty":
      return numeric ? query.not(col, "is", null) : query.not(col, "is", null).neq(col, "");
    case "greater_than":
      return query.gt(col, value);
    case "less_than":
      return query.lt(col, value);
    case "gte":
      return query.gte(col, value);
    case "lte":
      return query.lte(col, value);
    case "in_list":
      return query.in(col, value.split(",").map((v: string) => v.trim()).filter(Boolean));
    case "not_in_list": {
      const vals = value.split(",").map((v: string) => v.trim()).filter(Boolean);
      return vals.length > 0 ? query.not(col, "in", `(${vals.join(",")})`) : query;
    }
    case "is_true":
      return query.eq(col, true);
    case "is_false":
      return query.eq(col, false);
    default:
      return query;
  }
}

// Resolve household IDs → person IDs via BOTH link paths:
//   Path A: people.household_id (direct FK, often null on imported data)
//   Path B: person_households junction table (canonical link)
async function resolvePersonIdsByHouseholds(
  sb: any, tenantId: string, hhIds: string[]
): Promise<string[]> {
  if (hhIds.length === 0) return [];
  const personIds = new Set<string>();
  for (let i = 0; i < hhIds.length; i += 200) {
    const chunk = hhIds.slice(i, i + 200);
    // Path B — junction table
    const { data: jRows } = await sb
      .from("person_households")
      .select("person_id")
      .eq("tenant_id", tenantId)
      .in("household_id", chunk);
    for (const r of (jRows ?? []) as any[]) if (r.person_id) personIds.add(r.person_id);
    // Path A — direct FK
    const { data: dRows } = await sb
      .from("people")
      .select("id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .in("household_id", chunk);
    for (const r of (dRows ?? []) as any[]) personIds.add(r.id);
  }
  return [...personIds];
}

// Fields that live on the households table (joined via people.household_id)
const HOUSEHOLD_JOIN_FIELDS = new Set([
  "total_persons", "adults_count", "children_count", "generations_count",
  "household_voter_count", "household_parties", "head_of_household",
  "household_gender", "has_senior", "has_young_adult", "has_children",
  "is_single_parent", "has_disabled", "home_owner", "home_estimated_value",
  "home_purchase_year", "home_dwelling_type", "home_sqft", "home_bedrooms",
]);

export async function POST(request: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await request.json();
  const { target, filters = [] } = body as {
    target: SearchTarget;
    filters: SearchFilter[];
  };

  if (!target) {
    return NextResponse.json({ error: "target is required" }, { status: 400 });
  }

  // ── PEOPLE ───────────────────────────────────────────────────────────────
  if (target === "people") {
    const directFilters    = filters.filter((f) => !LOCATION_JOIN_FIELDS.has(f.field) && !HOUSEHOLD_JOIN_FIELDS.has(f.field));
    const locationFilters  = filters.filter((f) => LOCATION_JOIN_FIELDS.has(f.field));
    const householdFilters = filters.filter((f) => HOUSEHOLD_JOIN_FIELDS.has(f.field));

    // Resolve location filters → person IDs (via location → household → person, both link paths)
    let personIdFilterFromLocation: string[] | null = null;
    if (locationFilters.length > 0) {
      let locData: any[];
      try {
        locData = await fetchAll(() => {
          let q = sb.from("locations").select("id").eq("tenant_id", tenant.id);
          for (const f of locationFilters) q = applyFilter(q, resolveCol(f.field), f.op, f.value, f.data_type);
          return q;
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      const locIds = locData.map((l: any) => l.id);
      if (locIds.length === 0) return NextResponse.json([]);

      const { data: hhs } = await sb
        .from("households")
        .select("id")
        .eq("tenant_id", tenant.id)
        .in("location_id", locIds);
      const hhIds = (hhs ?? []).map((h: any) => h.id);
      if (hhIds.length === 0) return NextResponse.json([]);

      personIdFilterFromLocation = await resolvePersonIdsByHouseholds(sb, tenant.id, hhIds);
      if (personIdFilterFromLocation.length === 0) return NextResponse.json([]);
    }

    // Resolve household filters → person IDs (via household → person, both link paths)
    let personIdFilterFromHH: string[] | null = null;
    if (householdFilters.length > 0) {
      let hhData: any[];
      try {
        hhData = await fetchAll(() => {
          let q = sb.from("households").select("id").eq("tenant_id", tenant.id);
          for (const f of householdFilters) q = applyFilter(q, f.field, f.op, f.value, f.data_type);
          return q;
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      const hhIds = hhData.map((h: any) => h.id);
      if (hhIds.length === 0) return NextResponse.json([]);

      personIdFilterFromHH = await resolvePersonIdsByHouseholds(sb, tenant.id, hhIds);
      if (personIdFilterFromHH.length === 0) return NextResponse.json([]);
    }

    // Intersect person ID sets when multiple join filters are active
    let finalPersonIdFilter: string[] | null = null;
    if (personIdFilterFromLocation && personIdFilterFromHH) {
      const setHH = new Set(personIdFilterFromHH);
      finalPersonIdFilter = personIdFilterFromLocation.filter((id) => setHH.has(id));
      if (finalPersonIdFilter.length === 0) return NextResponse.json([]);
    } else {
      finalPersonIdFilter = personIdFilterFromLocation ?? personIdFilterFromHH ?? null;
    }

    let people: any[];
    try {
      people = await fetchAll(() => {
        let q = sb
          .from("people")
          .select("id, first_name, last_name, email, phone, contact_type, household_id, tenant_people!inner(tenant_id)")
          .eq("tenant_people.tenant_id", tenant.id);
        for (const f of directFilters) q = applyFilter(q, resolveCol(f.field), f.op, f.value, f.data_type);
        if (finalPersonIdFilter) q = q.in("id", finalPersonIdFilter);
        return q;
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const results = people.map((p: any) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      contact_type: p.contact_type,
    }));

    return NextResponse.json(results);
  }

  // ── HOUSEHOLDS ───────────────────────────────────────────────────────────
  if (target === "households") {
    const directFilters = filters.filter((f) => !LOCATION_JOIN_FIELDS.has(f.field));
    const locationFilters = filters.filter((f) => LOCATION_JOIN_FIELDS.has(f.field));

    let locationIdFilter: string[] | null = null;
    if (locationFilters.length > 0) {
      let locData: any[];
      try {
        locData = await fetchAll(() => {
          let q = sb.from("locations").select("id").eq("tenant_id", tenant.id);
          for (const f of locationFilters) q = applyFilter(q, resolveCol(f.field), f.op, f.value, f.data_type);
          return q;
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      locationIdFilter = locData.map((l: any) => l.id);
      if (locationIdFilter.length === 0) return NextResponse.json([]);
    }

    let households: any[];
    try {
      households = await fetchAll(() => {
        let q = sb
          .from("households")
          .select("id, name, notes, location_id")
          .eq("tenant_id", tenant.id);
        for (const f of directFilters) q = applyFilter(q, resolveCol(f.field), f.op, f.value, f.data_type);
        if (locationIdFilter) q = q.in("location_id", locationIdFilter);
        return q;
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    if (!households.length) return NextResponse.json([]);

    // Fetch location info for display
    const locIds = [...new Set(households.map((h: any) => h.location_id).filter(Boolean))];
    const locMap = new Map<string, any>();
    if (locIds.length) {
      const { data: locs } = await sb
        .from("locations")
        .select("id, address_line1, city, state, postal_code")
        .in("id", locIds);
      for (const l of locs ?? []) locMap.set(l.id, l);
    }

    // Count people per household
    const hhIds = households.map((h: any) => h.id);
    const { data: phRows } = await sb
      .from("person_households")
      .select("household_id")
      .eq("tenant_id", tenant.id)
      .in("household_id", hhIds);
    const peopleCounts = new Map<string, number>();
    for (const ph of phRows ?? []) {
      peopleCounts.set(ph.household_id, (peopleCounts.get(ph.household_id) ?? 0) + 1);
    }

    const results = households.map((h: any) => {
      const loc = locMap.get(h.location_id);
      return {
        id: h.id,
        name: h.name,
        address: loc?.address_line1 ?? "",
        city: loc?.city ?? "",
        state: loc?.state ?? "",
        postal_code: loc?.postal_code ?? "",
        people_count: peopleCounts.get(h.id) ?? 0,
        location_id: h.location_id,
      };
    });

    return NextResponse.json(results);
  }

  // ── LOCATIONS ────────────────────────────────────────────────────────────
  if (target === "locations") {
    let locations: any[];
    try {
      locations = await fetchAll(() => {
        let q = sb
          .from("locations")
          .select("id, address_line1, city, state, postal_code")
          .eq("tenant_id", tenant.id);
        for (const f of filters) q = applyFilter(q, resolveCol(f.field), f.op, f.value, f.data_type);
        return q;
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    if (!locations.length) return NextResponse.json([]);

    // Count people via households
    const locIds = locations.map((l: any) => l.id);
    const { data: hhs } = await sb
      .from("households")
      .select("id, location_id")
      .eq("tenant_id", tenant.id)
      .in("location_id", locIds);

    const hhIds = (hhs ?? []).map((h: any) => h.id);
    const locToHh = new Map<string, string[]>();
    for (const h of hhs ?? []) {
      const arr = locToHh.get(h.location_id) ?? [];
      arr.push(h.id);
      locToHh.set(h.location_id, arr);
    }

    const peopleCounts = new Map<string, number>();
    if (hhIds.length) {
      const { data: phRows } = await sb
        .from("person_households")
        .select("household_id")
        .eq("tenant_id", tenant.id)
        .in("household_id", hhIds);
      const hhPeopleCount = new Map<string, number>();
      for (const ph of phRows ?? []) {
        hhPeopleCount.set(ph.household_id, (hhPeopleCount.get(ph.household_id) ?? 0) + 1);
      }
      for (const [locId, hhArr] of locToHh) {
        const total = hhArr.reduce((s, hhId) => s + (hhPeopleCount.get(hhId) ?? 0), 0);
        peopleCounts.set(locId, total);
      }
    }

    return NextResponse.json(
      locations.map((l: any) => ({
        id: l.id,
        address: l.address_line1 ?? "",
        city: l.city ?? "",
        state: l.state ?? "",
        postal_code: l.postal_code ?? "",
        people_count: peopleCounts.get(l.id) ?? 0,
      }))
    );
  }

  // ── COMPANIES ────────────────────────────────────────────────────────────
  if (target === "companies") {
    let companies: any[];
    try {
      companies = await fetchAll(() => {
        let q = sb
          .from("companies")
          .select("id, name, phone, email, industry")
          .in("id",
            sb.from("tenant_companies").select("company_id").eq("tenant_id", tenant.id)
          );
        for (const f of filters) q = applyFilter(q, f.field, f.op, f.value, f.data_type);
        return q;
      });
    } catch {
      // Fallback without tenant join in case tenant_companies doesn't exist
      try {
        companies = await fetchAll(() => {
          let q = sb.from("companies").select("id, name, phone, email, industry");
          for (const f of filters) q = applyFilter(q, f.field, f.op, f.value, f.data_type);
          return q;
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }
    return NextResponse.json(
      companies.map((c: any) => ({
        id: c.id,
        name: c.name ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        industry: c.industry ?? null,
      }))
    );
  }

  return NextResponse.json({ error: "Invalid target" }, { status: 400 });
}
