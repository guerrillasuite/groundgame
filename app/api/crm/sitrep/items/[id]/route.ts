import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const PATCHABLE = [
  "title", "description", "status", "priority", "due_date",
  "start_at", "end_at", "is_all_day", "agenda", "meeting_notes",
  "mission_id", "visibility", "location", "location_address",
  "parent_item_id",
] as const;

// Fields to track in activity log
const TRACKED: Record<string, string> = {
  status:        "status_changed",
  priority:      "priority_changed",
  due_date:      "due_changed",
  title:         "title_changed",
  parent_item_id: "parent_changed",
};

// GET /api/crm/sitrep/items/[id]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data: item, error } = await sb
    .from("sitrep_items")
    .select(`
      *,
      sitrep_assignments(user_id, role, accepted),
      sitrep_links(id, record_type, record_id, display_label)
    `)
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const i = item as any;
  if (i.visibility === "private" && i.created_by !== crmUser.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch child count
  const { count: childCount } = await sb
    .from("sitrep_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_item_id", id)
    .eq("tenant_id", tenant.id);

  const { count: childDoneCount } = await sb
    .from("sitrep_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_item_id", id)
    .eq("tenant_id", tenant.id)
    .eq("status", "done");

  return NextResponse.json({
    ...item,
    child_count: childCount ?? 0,
    children_done: childDoneCount ?? 0,
  });
}

// PATCH /api/crm/sitrep/items/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const sb = makeSb(tenant.id);

  const { data: existing } = await sb
    .from("sitrep_items")
    .select("id, created_by, visibility, item_type, status, priority, due_date, title, parent_item_id, depth")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ex = existing as any;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of PATCHABLE) {
    if (key in body) patch[key] = body[key];
  }

  // If reparenting, recompute depth
  if ("parent_item_id" in body) {
    if (body.parent_item_id === null) {
      patch.depth = 0;
    } else {
      const { data: newParent } = await sb
        .from("sitrep_items")
        .select("depth")
        .eq("id", body.parent_item_id)
        .eq("tenant_id", tenant.id)
        .single();
      if (!newParent) return NextResponse.json({ error: "Parent not found" }, { status: 404 });
      const newDepth = (newParent as any).depth + 1;
      if (newDepth > 3) return NextResponse.json({ error: "Maximum nesting depth of 3 exceeded" }, { status: 400 });
      patch.depth = newDepth;
    }
  }

  // Set completed_at / cancelled_at when status changes
  if (body.status === "done" && !ex.completed_at) {
    patch.completed_at = new Date().toISOString();
  }
  if (body.status === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
  }

  const { error } = await sb
    .from("sitrep_items")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write activity log for tracked fields
  const activityRows: any[] = [];
  for (const [field, eventType] of Object.entries(TRACKED)) {
    if (field in body && body[field] !== ex[field]) {
      activityRows.push({
        tenant_id:  tenant.id,
        item_id:    id,
        actor_id:   crmUser.userId,
        event_type: eventType,
        old_value:  ex[field] != null ? String(ex[field]) : null,
        new_value:  body[field] != null ? String(body[field]) : null,
      });
    }
  }
  if (activityRows.length > 0) {
    await sb.from("sitrep_activity").insert(activityRows);
  }

  // Assignment management
  if (Array.isArray(body.add_assignee_ids) && body.add_assignee_ids.length > 0) {
    const role = body.assignment_role ?? "assignee";
    await sb.from("sitrep_assignments").upsert(
      body.add_assignee_ids.map((uid: string) => ({ item_id: id, user_id: uid, role })),
      { onConflict: "item_id,user_id" }
    );
    await sb.from("sitrep_activity").insert({
      tenant_id: tenant.id, item_id: id, actor_id: crmUser.userId,
      event_type: "assigned", new_value: body.add_assignee_ids.join(","),
    });
  }
  if (Array.isArray(body.remove_assignee_ids) && body.remove_assignee_ids.length > 0) {
    await sb.from("sitrep_assignments").delete()
      .eq("item_id", id)
      .in("user_id", body.remove_assignee_ids);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/crm/sitrep/items/[id]
// Query params:
//   cascade=true   — delete all children recursively
//   orphan=true    — keep children, set parent_item_id=null
// If neither param + item has children → 409 with child_count
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cascade = searchParams.get("cascade") === "true";
  const orphan  = searchParams.get("orphan")  === "true";

  const sb = makeSb(tenant.id);

  const { data: existing } = await sb
    .from("sitrep_items")
    .select("created_by")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((existing as any).created_by !== crmUser.userId && !crmUser.isSuperAdmin) {
    return NextResponse.json({ error: "Only the creator can delete this item" }, { status: 403 });
  }

  // Check for children
  const { count: childCount } = await sb
    .from("sitrep_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_item_id", id)
    .eq("tenant_id", tenant.id);

  if ((childCount ?? 0) > 0) {
    if (!cascade && !orphan) {
      return NextResponse.json({ error: "Item has children", child_count: childCount }, { status: 409 });
    }
    if (orphan) {
      await sb
        .from("sitrep_items")
        .update({ parent_item_id: null, depth: 0 })
        .eq("parent_item_id", id)
        .eq("tenant_id", tenant.id);
    }
    // cascade: ON DELETE CASCADE on FK handles recursive delete
  }

  const { error } = await sb
    .from("sitrep_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
