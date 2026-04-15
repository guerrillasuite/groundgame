import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type SegmentFilter = { field: string; op: string; value: string };

function applyFilter(filter: SegmentFilter, row: Record<string, any>): boolean {
  const { field, op, value } = filter;
  const parts = field.split(".");
  let fieldVal: any = row;
  for (const part of parts) {
    fieldVal = fieldVal?.[part];
    if (fieldVal == null) { fieldVal = ""; break; }
  }
  const strVal = String(fieldVal ?? "").toLowerCase();
  const fVal = value.toLowerCase();
  switch (op) {
    case "contains":    return strVal.includes(fVal);
    case "equals":      return strVal === fVal;
    case "starts_with": return strVal.startsWith(fVal);
    case "not_contains": return !strVal.includes(fVal);
    case "is_empty":    return strVal === "";
    case "not_empty":   return strVal !== "";
    case "greater_than": return parseFloat(strVal) > parseFloat(fVal);
    case "less_than":   return parseFloat(strVal) < parseFloat(fVal);
    default:            return true;
  }
}

/** Fetch all rows from a table, bypassing PostgREST's 1000-row default limit */
async function fetchAll<T>(
  query: () => ReturnType<ReturnType<typeof makeSb>["from"]>["select"],
  pageSize = 1000
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (query() as any).range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

export async function POST(req: NextRequest) {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { audience_type, audience_list_id, audience_segment_filters } = body as {
    audience_type: "segment" | "list";
    audience_list_id?: string | null;
    audience_segment_filters?: SegmentFilter[] | null;
  };

  const sb = makeSb(tenant.id);

  // ── List-based ─────────────────────────────────────────────────────────────
  if (audience_type === "list" && audience_list_id) {
    const items = await fetchAll<{ person_id: string }>(
      () => sb.from("walklist_items").select("person_id")
        .eq("walklist_id", audience_list_id)
        .not("person_id", "is", null) as any
    );
    const personIds = items.map((i) => i.person_id).filter(Boolean);
    if (personIds.length === 0) return NextResponse.json({ people: [] });

    // Fetch person details in chunks of 200
    const people: Array<Record<string, any>> = [];
    for (let i = 0; i < personIds.length; i += 200) {
      const chunk = personIds.slice(i, i + 200);
      const { data } = await sb
        .from("people")
        .select("id, first_name, last_name, email, tenant_people!inner(tenant_id)")
        .eq("tenant_people.tenant_id", tenant.id)
        .in("id", chunk)
        .not("email", "is", null)
        .neq("email", "");
      people.push(...(data ?? []));
    }
    return NextResponse.json({ people: people.map(({ id, first_name, last_name, email }) => ({ id, first_name, last_name, email })) });
  }

  // ── Segment-based ──────────────────────────────────────────────────────────
  const filters: SegmentFilter[] = (audience_segment_filters as any[]) ?? [];
  const needsLocation = filters.some((f) => ["city", "state", "postal_code"].includes(f.field));
  const needsCompany  = filters.some((f) => f.field.startsWith("company."));
  const needsOpp      = filters.some((f) => f.field.startsWith("opp."));

  // Fetch ALL people with email, paginating past the 1000-row limit
  const rawPeople = await fetchAll<Record<string, any>>(
    () => sb.from("people")
      .select("id, first_name, last_name, email, household_id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .not("email", "is", null)
      .neq("email", "") as any
  );

  let rows: Array<Record<string, any>> = rawPeople;

  // Enrich location
  if (needsLocation && rows.length > 0) {
    const hhIds = [...new Set(rows.map((p) => p.household_id).filter(Boolean))] as string[];
    if (hhIds.length > 0) {
      const hh: Array<Record<string, any>> = [];
      for (let i = 0; i < hhIds.length; i += 200) {
        const { data } = await sb.from("households").select("id, location_id").in("id", hhIds.slice(i, i + 200));
        hh.push(...(data ?? []));
      }
      const locIds = hh.map((h) => h.location_id).filter(Boolean);
      if (locIds.length > 0) {
        const locs: Array<Record<string, any>> = [];
        for (let i = 0; i < locIds.length; i += 200) {
          const { data } = await sb.from("locations").select("id, city, state, postal_code").in("id", locIds.slice(i, i + 200));
          locs.push(...(data ?? []));
        }
        const locMap = new Map(locs.map((l) => [l.id, l]));
        const hhMap  = new Map(hh.map((h) => [h.id, h]));
        rows = rows.map((p) => {
          const hhRow = p.household_id ? hhMap.get(p.household_id) : null;
          const loc   = hhRow?.location_id ? locMap.get(hhRow.location_id) : null;
          return { ...p, city: loc?.city ?? "", state: loc?.state ?? "", postal_code: loc?.postal_code ?? "" };
        });
      }
    }
  }

  // Enrich company
  if (needsCompany && rows.length > 0) {
    const pids = rows.map((p) => p.id);
    const pcRows: Array<Record<string, any>> = [];
    for (let i = 0; i < pids.length; i += 200) {
      const { data } = await sb.from("person_companies")
        .select("person_id, company:company_id(name, industry, status)")
        .in("person_id", pids.slice(i, i + 200));
      pcRows.push(...(data ?? []));
    }
    const companyMap = new Map(pcRows.map((pc) => [pc.person_id, pc.company]));
    rows = rows.map((p) => ({ ...p, company: companyMap.get(p.id) ?? {} }));
  }

  // Enrich opportunity
  if (needsOpp && rows.length > 0) {
    const pids = rows.map((p) => p.id);
    const opps: Array<Record<string, any>> = [];
    for (let i = 0; i < pids.length; i += 200) {
      const { data } = await sb.from("opportunities")
        .select("contact_person_id, stage, pipeline, source, priority")
        .eq("tenant_id", tenant.id)
        .in("contact_person_id", pids.slice(i, i + 200));
      opps.push(...(data ?? []));
    }
    const oppMap = new Map(opps.map((o) => [o.contact_person_id, o]));
    rows = rows.map((p) => ({ ...p, opp: oppMap.get(p.id) ?? {} }));
  }

  // Apply JS filters
  const filtered = filters.length > 0
    ? rows.filter((row) => filters.every((f) => applyFilter(f, row)))
    : rows;

  return NextResponse.json({
    people: filtered.map(({ id, first_name, last_name, email }) => ({ id, first_name, last_name, email })),
  });
}
