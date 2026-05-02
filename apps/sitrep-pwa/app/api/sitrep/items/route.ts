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

function makeRawSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/sitrep/items
// Returns all items assigned to or created by the authenticated user,
// across every tenant they belong to.
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeRawSb();

  // All tenants this user is a member of
  const { data: memberships } = await sb
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", user.userId)
    .in("status", ["active", "invited"]);

  const tenantIds = (memberships ?? []).map((m: any) => m.tenant_id as string);
  if (!tenantIds.length) return NextResponse.json([]);

  // All item IDs this user is explicitly assigned to
  const { data: assignments } = await sb
    .from("sitrep_assignments")
    .select("item_id")
    .eq("user_id", user.userId);

  const assignedIds = [...new Set((assignments ?? []).map((a: any) => a.item_id as string))];

  // Two parallel queries to avoid large .or() URL limits
  const [createdRes, assignedRes] = await Promise.all([
    // Items created by this user across all their tenants
    sb.from("sitrep_items")
      .select(SELECT)
      .in("tenant_id", tenantIds)
      .eq("created_by", user.userId)
      .limit(500),

    // Items assigned to this user (cap at 500 IDs to stay within URL limits)
    assignedIds.length > 0
      ? sb.from("sitrep_items")
          .select(SELECT)
          .in("tenant_id", tenantIds)
          .in("id", assignedIds.slice(0, 500))
          .limit(500)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (createdRes.error) return NextResponse.json({ error: createdRes.error.message }, { status: 500 });

  // Merge and dedup by id
  const seen = new Set<string>();
  const items: any[] = [];
  for (const item of [...(createdRes.data ?? []), ...(assignedRes.data ?? [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  // Sort by effective date ascending, nulls last
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

  // Auto-assign creator
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
