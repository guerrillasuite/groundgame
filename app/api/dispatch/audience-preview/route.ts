import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import {
  applyFilter,
  fetchAll,
  resolveCol,
  LOCATION_JOIN_FIELDS,
  HOUSEHOLD_JOIN_FIELDS,
  resolvePersonIdsByHouseholds,
  FilterOp,
} from "@/app/api/crm/search/route";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type SegmentFilter = { field: string; op: string; value: string; data_type?: string };

/** JS-side filter for company/opp nested objects (cross-table joins not on people). */
function jsFilter(f: SegmentFilter, row: Record<string, any>): boolean {
  const parts = f.field.split(".");
  let val: any = row;
  for (const p of parts) { val = val?.[p]; if (val == null) { val = ""; break; } }
  const s = String(val ?? "").toLowerCase();
  const v = f.value.toLowerCase();
  switch (f.op) {
    case "contains":     return s.includes(v);
    case "equals":       return s === v;
    case "starts_with":  return s.startsWith(v);
    case "not_contains": return !s.includes(v);
    case "is_empty":     return s === "";
    case "not_empty":    return s !== "";
    case "greater_than": return parseFloat(s) > parseFloat(v);
    case "less_than":    return parseFloat(s) < parseFloat(v);
    default:             return true;
  }
}

export async function POST(req: NextRequest) {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { audience_type, audience_list_id, audience_segment_filters, audience_person_ids } = body as {
    audience_type: "segment" | "list" | "manual";
    audience_list_id?: string | null;
    audience_segment_filters?: SegmentFilter[] | null;
    audience_person_ids?: string[] | null;
  };

  // ── Manual (hand-picked) audience ──────────────────────────────────────────
  if (audience_type === "manual") {
    const ids = audience_person_ids ?? [];
    return NextResponse.json({ count: ids.length, suppressed: 0 });
  }

  const sb = makeSb(tenant.id);

  // ── Fetch unsubscribed emails for suppression ───────────────────────────
  const { data: unsubRows } = await sb
    .from("email_unsubscribes")
    .select("email_address")
    .eq("tenant_id", tenant.id);
  const unsubEmails = new Set((unsubRows ?? []).map((u: any) => u.email_address.toLowerCase()));

  // ── List-based audience ────────────────────────────────────────────────
  if (audience_type === "list" && audience_list_id) {
    const { data: items } = await sb
      .from("walklist_items")
      .select("person_id")
      .eq("walklist_id", audience_list_id)
      .not("person_id", "is", null);

    const personIds = (items ?? []).map((i: any) => i.person_id).filter(Boolean);
    if (personIds.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });

    const { data: ppl } = await sb
      .from("people")
      .select("email, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .in("id", personIds.slice(0, 1000))
      .not("email", "is", null)
      .neq("email", "");

    const withEmail = ppl ?? [];
    const eligible = withEmail.filter(
      (p: any) => p.email && !unsubEmails.has(p.email.toLowerCase())
    );
    const no_email = personIds.length - withEmail.length;
    const unsubscribed = withEmail.length - eligible.length;
    return NextResponse.json({ count: eligible.length, suppressed: no_email + unsubscribed, no_email, unsubscribed });
  }

  // ── Segment-based audience (PostgREST filtering) ──────────────────────
  const filters: SegmentFilter[] = audience_segment_filters ?? [];

  const directFilters    = filters.filter((f) => !LOCATION_JOIN_FIELDS.has(f.field) && !HOUSEHOLD_JOIN_FIELDS.has(f.field) && !f.field.startsWith("company.") && !f.field.startsWith("opp."));
  const locationFilters  = filters.filter((f) => LOCATION_JOIN_FIELDS.has(f.field));
  const householdFilters = filters.filter((f) => HOUSEHOLD_JOIN_FIELDS.has(f.field));
  const companyFilters   = filters.filter((f) => f.field.startsWith("company."));
  const oppFilters       = filters.filter((f) => f.field.startsWith("opp."));

  // Resolve location filters → person IDs
  let personIdFilterFromLocation: string[] | null = null;
  if (locationFilters.length > 0) {
    let locData: any[];
    try {
      locData = await fetchAll(() => {
        let q = sb.from("locations").select("id").eq("tenant_id", tenant.id);
        for (const f of locationFilters) q = applyFilter(q, resolveCol(f.field), f.op as FilterOp, f.value, f.data_type);
        return q;
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const locIds = locData.map((l: any) => l.id);
    if (locIds.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });
    const { data: hhs } = await sb.from("households").select("id").eq("tenant_id", tenant.id).in("location_id", locIds);
    const hhIds = (hhs ?? []).map((h: any) => h.id);
    if (hhIds.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });
    personIdFilterFromLocation = await resolvePersonIdsByHouseholds(sb, tenant.id, hhIds);
    if (personIdFilterFromLocation.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });
  }

  // Resolve household filters → person IDs
  let personIdFilterFromHH: string[] | null = null;
  if (householdFilters.length > 0) {
    let hhData: any[];
    try {
      hhData = await fetchAll(() => {
        let q = sb.from("households").select("id").eq("tenant_id", tenant.id);
        for (const f of householdFilters) q = applyFilter(q, f.field, f.op as FilterOp, f.value, f.data_type);
        return q;
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const hhIds = hhData.map((h: any) => h.id);
    if (hhIds.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });
    personIdFilterFromHH = await resolvePersonIdsByHouseholds(sb, tenant.id, hhIds);
    if (personIdFilterFromHH.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });
  }

  // Intersect person ID sets
  let finalPersonIdFilter: string[] | null = null;
  if (personIdFilterFromLocation && personIdFilterFromHH) {
    const setHH = new Set(personIdFilterFromHH);
    finalPersonIdFilter = personIdFilterFromLocation.filter((id) => setHH.has(id));
    if (finalPersonIdFilter.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });
  } else {
    finalPersonIdFilter = personIdFilterFromLocation ?? personIdFilterFromHH ?? null;
  }

  // Fetch people via PostgREST (no row limit)
  let rows: any[];
  try {
    rows = await fetchAll(() => {
      let q = sb
        .from("people")
        .select("id, email, household_id, tenant_people!inner(tenant_id)")
        .eq("tenant_people.tenant_id", tenant.id)
        .not("email", "is", null)
        .neq("email", "");
      for (const f of directFilters) q = applyFilter(q, resolveCol(f.field), f.op as FilterOp, f.value, f.data_type);
      if (finalPersonIdFilter) q = q.in("id", finalPersonIdFilter);
      return q;
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Deduplicate (inner join can produce duplicates)
  rows = [...new Map(rows.map((p: any) => [p.id, p])).values()];

  // Company JS enrichment + filter
  if (companyFilters.length > 0 && rows.length > 0) {
    const pids = rows.map((p: any) => p.id);
    const pcRows: any[] = [];
    for (let i = 0; i < pids.length; i += 200) {
      const { data } = await sb.from("person_companies")
        .select("person_id, company:company_id(name, industry, status)")
        .in("person_id", pids.slice(i, i + 200));
      pcRows.push(...(data ?? []));
    }
    const companyMap = new Map(pcRows.map((pc: any) => [pc.person_id, pc.company]));
    rows = rows.map((p: any) => ({ ...p, company: companyMap.get(p.id) ?? {} }));
    rows = rows.filter((row) => companyFilters.every((f) => jsFilter(f, row)));
  }

  // Opp JS enrichment + filter
  if (oppFilters.length > 0 && rows.length > 0) {
    const pids = rows.map((p: any) => p.id);
    const opps: any[] = [];
    for (let i = 0; i < pids.length; i += 200) {
      const { data } = await sb.from("opportunities")
        .select("contact_person_id, stage, pipeline, source, priority")
        .eq("tenant_id", tenant.id)
        .in("contact_person_id", pids.slice(i, i + 200));
      opps.push(...(data ?? []));
    }
    const oppMap = new Map(opps.map((o: any) => [o.contact_person_id, o]));
    rows = rows.map((p: any) => ({ ...p, opp: oppMap.get(p.id) ?? {} }));
    rows = rows.filter((row) => oppFilters.every((f) => jsFilter(f, row)));
  }

  // Apply unsubscribe suppression
  const eligible = rows.filter((p: any) => p.email && !unsubEmails.has(p.email.toLowerCase()));
  const unsubscribed = rows.length - eligible.length;

  return NextResponse.json({ count: eligible.length, suppressed: unsubscribed, no_email: 0, unsubscribed });
}
