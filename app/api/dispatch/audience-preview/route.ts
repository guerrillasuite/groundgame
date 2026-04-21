import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type SegmentFilter = { field: string; op: string; value: string };

/** Apply a single filter condition in JS after fetching. Returns true if the row passes. */
function applyFilter(filter: SegmentFilter, row: Record<string, any>): boolean {
  const { field, op, value } = filter;

  // Resolve the field value from nested paths like "company.name"
  const parts = field.split(".");
  let fieldVal: any = row;
  for (const part of parts) {
    fieldVal = fieldVal?.[part];
    if (fieldVal === undefined || fieldVal === null) {
      fieldVal = "";
      break;
    }
  }
  const strVal = String(fieldVal ?? "").toLowerCase();
  const filterVal = value.toLowerCase();

  switch (op) {
    case "contains":    return strVal.includes(filterVal);
    case "equals":      return strVal === filterVal;
    case "starts_with": return strVal.startsWith(filterVal);
    case "not_contains": return !strVal.includes(filterVal);
    case "is_empty":    return strVal === "";
    case "not_empty":   return strVal !== "";
    case "greater_than": return parseFloat(strVal) > parseFloat(filterVal);
    case "less_than":    return parseFloat(strVal) < parseFloat(filterVal);
    default:            return true;
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

  // ── Manual (hand-picked) audience ────────────────────────────────────────────
  if (audience_type === "manual") {
    const ids = audience_person_ids ?? [];
    return NextResponse.json({ count: ids.length, suppressed: 0 });
  }

  const sb = makeSb(tenant.id);

  // ── Fetch unsubscribed emails for suppression ────────────────────────────
  const { data: unsubRows } = await sb
    .from("email_unsubscribes")
    .select("email_address")
    .eq("tenant_id", tenant.id);
  const unsubEmails = new Set((unsubRows ?? []).map((u: any) => u.email_address.toLowerCase()));

  // ── List-based audience ──────────────────────────────────────────────────
  if (audience_type === "list" && audience_list_id) {
    const { data: items } = await sb
      .from("walklist_items")
      .select("person_id")
      .eq("walklist_id", audience_list_id)
      .not("person_id", "is", null);

    const personIds = (items ?? []).map((i: any) => i.person_id).filter(Boolean);
    if (personIds.length === 0) return NextResponse.json({ count: 0, suppressed: 0 });

    // Fetch emails for these people
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

  // ── Segment-based audience ───────────────────────────────────────────────

  // Determine if we need company or opportunity joins
  const filters = audience_segment_filters ?? [];
  const needsCompany = filters.some((f) => f.field.startsWith("company."));
  const needsOpp     = filters.some((f) => f.field.startsWith("opp."));
  const needsLocation = filters.some((f) => ["city", "state", "postal_code"].includes(f.field));

  // Fetch all people with email
  const { data: ppl } = await sb
    .from("people")
    .select("id, first_name, last_name, email, household_id, tenant_people!inner(tenant_id)")
    .eq("tenant_people.tenant_id", tenant.id)
    .not("email", "is", null)
    .neq("email", "")
    .limit(5000);

  let rows: Array<Record<string, any>> = [...((ppl as any[]) ?? [])];

  // Enrich with location if needed
  if (needsLocation && rows.length > 0) {
    const hhIds = [...new Set(rows.map((p) => p.household_id).filter(Boolean))] as string[];
    if (hhIds.length > 0) {
      const { data: hh } = await sb
        .from("households")
        .select("id, location_id")
        .in("id", hhIds.slice(0, 500));
      const locIds = (hh ?? []).map((h: any) => h.location_id).filter(Boolean);
      if (locIds.length > 0) {
        const { data: locs } = await sb
          .from("locations")
          .select("id, city, state, postal_code")
          .in("id", locIds.slice(0, 500));
        const locMap = new Map((locs ?? []).map((l: any) => [l.id, l]));
        const hhMap = new Map((hh ?? []).map((h: any) => [h.id, h]));
        rows = rows.map((p) => {
          const hhRow = p.household_id ? hhMap.get(p.household_id) : null;
          const loc = hhRow?.location_id ? locMap.get(hhRow.location_id) : null;
          return { ...p, city: loc?.city ?? "", state: loc?.state ?? "", postal_code: loc?.postal_code ?? "" };
        });
      }
    }
  }

  // Enrich with company if needed
  if (needsCompany && rows.length > 0) {
    const personIds = rows.map((p) => p.id);
    const { data: pcRows } = await sb
      .from("person_companies")
      .select("person_id, company:company_id(name, industry, status)")
      .in("person_id", personIds.slice(0, 1000));
    const companyByPersonId = new Map(
      (pcRows ?? []).map((pc: any) => [pc.person_id, pc.company])
    );
    rows = rows.map((p) => ({ ...p, company: companyByPersonId.get(p.id) ?? {} }));
  }

  // Enrich with opportunity if needed
  if (needsOpp && rows.length > 0) {
    const personIds = rows.map((p) => p.id);
    const { data: opps } = await sb
      .from("opportunities")
      .select("contact_person_id, stage, pipeline, source, priority, tenant_id")
      .eq("tenant_id", tenant.id)
      .in("contact_person_id", personIds.slice(0, 1000));
    const oppByPersonId = new Map(
      (opps ?? []).map((o: any) => [o.contact_person_id, o])
    );
    rows = rows.map((p) => ({ ...p, opp: oppByPersonId.get(p.id) ?? {} }));
  }

  // Apply filters
  const filtered = filters.length > 0
    ? rows.filter((row) => filters.every((f) => applyFilter(f, row)))
    : rows;

  // Apply unsubscribe suppression
  const eligible = filtered.filter(
    (p) => p.email && !unsubEmails.has(p.email.toLowerCase())
  );
  const unsubscribed = filtered.length - eligible.length;

  return NextResponse.json({ count: eligible.length, suppressed: unsubscribed, no_email: 0, unsubscribed });
}
