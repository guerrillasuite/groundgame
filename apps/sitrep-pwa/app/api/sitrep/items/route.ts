import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { makeServiceSb } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const SELECT = `
  id, tenant_id, item_type, title, description, location, status, priority,
  due_date, start_at, end_at, is_all_day,
  mission_id, parent_item_id, depth,
  visibility, created_by, created_at,
  sitrep_assignments(user_id, role)
`;

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/sitrep/items
// Queries each of the user's tenants with the proper tenant header (same pattern as the
// main SitRep), then filters in-memory to items created by or assigned to this user.
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // All tenants this user belongs to
  const { data: memberships, error: mbErr } = await makeAdminSb()
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", user.userId)
    .in("status", ["active", "invited"]);

  if (mbErr) return NextResponse.json({ error: mbErr.message }, { status: 500 });

  const tenantIds = (memberships ?? []).map((m: any) => m.tenant_id as string);
  if (!tenantIds.length) return NextResponse.json([]);

  // Query each tenant separately with the proper X-Tenant-Id header — exactly
  // how the main SitRep does it. Parallel fetch across all tenants.
  const results = await Promise.all(
    tenantIds.map((tid) =>
      makeServiceSb(tid)
        .from("sitrep_items")
        .select(SELECT)
        .eq("tenant_id", tid)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("start_at", { ascending: true, nullsFirst: false })
        .limit(500)
    )
  );

  // Merge, dedup, filter to items where user is creator or assignee
  const seen = new Set<string>();
  const items: any[] = [];
  for (const { data } of results) {
    for (const item of (data ?? [])) {
      if (seen.has(item.id)) continue;
      const isCreator  = item.created_by === user.userId;
      const isAssigned = (item.sitrep_assignments ?? []).some((a: any) => a.user_id === user.userId);
      if (!isCreator && !isAssigned) continue;
      if (item.visibility === "private" && !isCreator) continue;
      seen.add(item.id);
      items.push(item);
    }
  }

  // Sort by effective date, nulls last
  items.sort((a, b) => {
    const da = a.due_date ?? a.start_at;
    const db = b.due_date ?? b.start_at;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });

  return NextResponse.json(items);
}

// POST /api/sitrep/items — creates in the specified tenant
export async function POST(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim() || !body?.item_type || !body?.tenantId) {
    return NextResponse.json({ error: "title, item_type, tenantId required" }, { status: 400 });
  }

  const sb = makeServiceSb(body.tenantId);

  const { data: item, error } = await sb
    .from("sitrep_items")
    .insert({
      tenant_id:   body.tenantId,
      item_type:   body.item_type,
      title:       body.title.trim(),
      status:      "open",
      priority:    body.item_type === "task" ? (body.priority ?? "normal") : null,
      due_date:    body.item_type === "task" ? (body.due_date ?? null) : null,
      start_at:    body.item_type !== "task" ? (body.due_date ?? null) : null,
      location:    body.location ?? null,
      visibility:  body.visibility ?? "assignee_only",
      created_by:  user.userId,
      depth:       0,
    })
    .select(SELECT)
    .single();

  if (error || !item) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

  await sb.from("sitrep_assignments").insert({
    item_id: (item as any).id,
    user_id: user.userId,
    role:    body.item_type === "meeting" ? "organizer" : "assignee",
  }).catch(() => {});

  await sb.from("sitrep_activity").insert({
    tenant_id: body.tenantId, item_id: (item as any).id,
    actor_id: user.userId, event_type: "created", new_value: body.title.trim(),
  }).catch(() => {});

  return NextResponse.json(item);
}
