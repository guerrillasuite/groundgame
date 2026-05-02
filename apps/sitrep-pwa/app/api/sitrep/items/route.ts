import { NextRequest, NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm-auth";
import { makeServiceSb } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const SELECT = `
  id, item_type, title, description, location, status, priority,
  due_date, start_at, end_at, is_all_day,
  mission_id, parent_item_id, depth,
  visibility, created_by, created_at,
  sitrep_assignments(user_id, role)
`;

// GET /api/sitrep/items?tenantId=xxx
export async function GET(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const sb = makeServiceSb(tenantId);

  const { data, error } = await sb
    .from("sitrep_items")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .order("due_date",  { ascending: true, nullsFirst: false })
    .order("start_at",  { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Visibility filter
  const items = ((data ?? []) as any[]).filter((item) => {
    if (item.visibility === "private") return item.created_by === user.userId;
    if (item.visibility === "assignee_only") {
      return item.created_by === user.userId ||
        item.sitrep_assignments?.some((a: any) => a.user_id === user.userId);
    }
    return true;
  });

  return NextResponse.json([...items]);
}

// POST /api/sitrep/items
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
      status:      body.item_type === "task" ? "open" : "open",
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
