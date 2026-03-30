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

type AppMode = "call" | "knock" | "both" | "text";
type Target = "people" | "households" | "locations" | "companies";

async function resolveCompanyIds(target: Target, selectedIds: string[]): Promise<string[]> {
  if (target === "companies") return selectedIds;
  return [];
}

async function resolvePersonIds(sb: any, tenantId: string, target: Target, selectedIds: string[]): Promise<string[]> {
  if (target === "people") return selectedIds;
  if (target === "companies") return [];

  if (target === "households") {
    const rows = await queryInChunks(sb, "person_households", "person_id", "household_id", selectedIds, (q) => q.eq("tenant_id", tenantId));
    return [...new Set(rows.map((r: any) => r.person_id).filter(Boolean) as string[])];
  }

  if (target === "locations") {
    // location → households → person_households → people
    const hhRows = await queryInChunks(sb, "households", "id", "location_id", selectedIds, (q) => q.eq("tenant_id", tenantId));
    const hhIds = hhRows.map((h: any) => h.id).filter(Boolean);
    if (!hhIds.length) return [];

    const phRows = await queryInChunks(sb, "person_households", "person_id", "household_id", hhIds, (q) => q.eq("tenant_id", tenantId));
    return [...new Set(phRows.map((r: any) => r.person_id).filter(Boolean) as string[])];
  }

  return [];
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

async function resolveLocationIds(sb: any, tenantId: string, target: Target, selectedIds: string[]): Promise<string[]> {
  if (target === "locations") return selectedIds;

  if (target === "households") {
    const rows = await queryInChunks(sb, "households", "location_id", "id", selectedIds, (q) => q.eq("tenant_id", tenantId));
    return [...new Set(rows.map((h: any) => h.location_id).filter(Boolean) as string[])];
  }

  if (target === "people") {
    const pairs = await resolvePersonLocationPairs(sb, tenantId, selectedIds);
    return [...new Set(pairs.map((p) => p.location_id))];
  }

  return [];
}

// For knock lists from people: returns one {person_id, location_id} pair per person.
// Tries people.household_id first; falls back to person_households junction table.
async function resolvePersonLocationPairs(
  sb: any,
  tenantId: string,
  personIds: string[]
): Promise<Array<{ person_id: string; location_id: string }>> {
  // Build person → household_id map via direct FK
  const peopleRows = await queryInChunks(sb, "people", "id, household_id", "id", personIds, (q) => q.eq("tenant_id", tenantId));
  const personToHh = new Map<string, string>();
  for (const p of peopleRows) {
    if (p.household_id) personToHh.set(p.id, p.household_id);
  }

  // Fall back to person_households junction for anyone without a direct household_id
  const missingIds = personIds.filter(id => !personToHh.has(id));
  if (missingIds.length) {
    const phRows = await queryInChunks(sb, "person_households", "person_id, household_id", "person_id", missingIds);
    for (const r of phRows) {
      if (r.person_id && r.household_id && !personToHh.has(r.person_id)) {
        personToHh.set(r.person_id, r.household_id);
      }
    }
  }

  const hhIds = [...new Set(personToHh.values())];
  if (!hhIds.length) return [];

  const hhRows = await queryInChunks(sb, "households", "id, location_id", "id", hhIds, (q) => q.eq("tenant_id", tenantId));
  const hhToLocation = new Map<string, string>(
    hhRows.filter((h: any) => h.location_id).map((h: any) => [h.id, h.location_id])
  );

  const pairs: Array<{ person_id: string; location_id: string }> = [];
  for (const personId of personIds) {
    const hhId = personToHh.get(personId);
    const locationId = hhId ? hhToLocation.get(hhId) : undefined;
    if (locationId) pairs.push({ person_id: personId, location_id: locationId });
  }
  return pairs;
}

async function createWalklist(
  sb: any,
  tenantId: string,
  name: string,
  mode: "call" | "knock" | "text",
  personIds: string[],
  locationIds: string[],
  userIds: string[],
  knockPairs?: Array<{ person_id: string; location_id: string }>,
  callCaptureMode?: string | null,
  surveyId?: string | null,
  description?: string | null,
  companyIds?: string[]
): Promise<{ id: string; name: string; mode: string; warning?: string }> {
  const { data: wl, error: wlErr } = await sb
    .from("walklists")
    .insert({
      name,
      mode,
      tenant_id: tenantId,
      call_capture_mode: callCaptureMode ?? null,
      survey_id: callCaptureMode === "survey" ? (surveyId ?? null) : null,
      ...(description ? { description } : {}),
    })
    .select("id, name, mode")
    .single();

  if (wlErr || !wl) {
    throw new Error(wlErr?.message ?? "Failed to create walklist");
  }

  // Insert walklist_items
  const resolvedCompanyIds = companyIds ?? [];
  const rawItems =
    resolvedCompanyIds.length
      ? resolvedCompanyIds.map((id) => ({ company_id: id }))
      : mode === "call" || mode === "text"
      ? personIds.map((id) => ({ person_id: id }))
      : knockPairs
      ? knockPairs.map((p) => ({ person_id: p.person_id, location_id: p.location_id }))
      : locationIds.map((id) => ({ location_id: id }));

  const items = rawItems.map((item, idx) => ({
    ...item,
    walklist_id: wl.id,
    tenant_id: tenantId,
    order_index: idx,
    status: "pending",
  }));

  let warning: string | undefined;
  if (items.length > 0) {
    // Insert in chunks to avoid PostgREST URL length limits on large arrays
    const CHUNK = 500;
    for (let i = 0; i < items.length; i += CHUNK) {
      const { error: itemErr } = await sb.from("walklist_items").insert(items.slice(i, i + CHUNK));
      if (itemErr) {
        warning = itemErr.message;
        break;
      }
    }
  } else {
    warning = `No items to insert (${mode === "call" || mode === "text" ? "no person IDs" : "no location IDs"} resolved)`;
  }

  // Insert walklist_assignments
  if (userIds.length > 0) {
    const assignments = userIds.map((uid) => ({
      walklist_id: wl.id,
      user_id: uid,
      tenant_id: tenantId,
    }));
    await sb.from("walklist_assignments").insert(assignments);
  }

  return { ...wl, warning };
}

export async function POST(request: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await request.json();
  const { name, app_mode, target, selected_ids, user_ids, call_capture_mode, survey_id, description } = body as {
    name: string;
    app_mode: AppMode;
    target: Target;
    selected_ids: string[];
    user_ids?: string[];
    call_capture_mode?: string | null;
    survey_id?: string | null;
    description?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!app_mode || !target) {
    return NextResponse.json({ error: "app_mode and target are required" }, { status: 400 });
  }

  const ids = selected_ids ?? [];
  const assignees = user_ids ?? [];

  // Resolve IDs once (reuse for both if needed)
  const resolvedCompanyIds = await resolveCompanyIds(target, ids);

  const personIds =
    app_mode === "knock" || target === "companies"
      ? []
      : await resolvePersonIds(sb, tenant.id, target, ids);

  // For knock lists from people: resolve pairs (person_id + location_id per item)
  const knockPairs =
    app_mode !== "call" && target === "people"
      ? await resolvePersonLocationPairs(sb, tenant.id, ids)
      : undefined;

  const locationIds =
    app_mode === "call" || app_mode === "text" || target === "people" || target === "companies"
      ? []
      : await resolveLocationIds(sb, tenant.id, target, ids);

  const walklists: Array<{ id: string; name: string; mode: string; warning?: string }> = [];

  try {
    if (app_mode === "call" || app_mode === "both") {
      const listName = app_mode === "both" ? `${name.trim()} — Calls` : name.trim();
      const wl = await createWalklist(sb, tenant.id, listName, "call", personIds, [], assignees, undefined, call_capture_mode, survey_id, null, resolvedCompanyIds.length ? resolvedCompanyIds : undefined);
      walklists.push(wl);
    }

    if (app_mode === "text") {
      const wl = await createWalklist(sb, tenant.id, name.trim(), "text", personIds, [], assignees, undefined, null, null, description ?? null, resolvedCompanyIds.length ? resolvedCompanyIds : undefined);
      walklists.push(wl);
    }

    if (app_mode === "knock" || app_mode === "both") {
      const listName = app_mode === "both" ? `${name.trim()} — Doors` : name.trim();
      const wl = await createWalklist(sb, tenant.id, listName, "knock", [], locationIds, assignees, knockPairs, call_capture_mode, survey_id);
      walklists.push(wl);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to create list" }, { status: 500 });
  }

  return NextResponse.json({ walklists });
}
