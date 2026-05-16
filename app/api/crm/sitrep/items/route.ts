import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { fireAutomations } from "@/lib/automations/engine";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// GET /api/crm/sitrep/items
// Query params:
//   type          — 'task' | 'event' | 'meeting' (omit for all)
//   status        — filter by stage slug
//   mine          — 'true' → items where current user is creator or assignee
//   mission_id    — filter by legacy mission FK
//   parent_id     — filter by parent_item_id (pass 'root' for top-level only)
//   limit         — default 100
//   include_children — 'true' to include child counts
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);
  const { searchParams } = new URL(req.url);

  const type             = searchParams.get("type");
  const status           = searchParams.get("status");
  const mine             = searchParams.get("mine") === "true";
  const missionId        = searchParams.get("mission_id");
  const parentId         = searchParams.get("parent_id");
  const limit            = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

  let query = sb
    .from("sitrep_items")
    .select(`
      id, tenant_id, item_type, title, description,
      status, priority, due_date,
      start_at, end_at, is_all_day,
      agenda, meeting_notes,
      mission_id, parent_item_id, depth,
      visibility, owner_user_id,
      is_recurring,
      location_id, meeting_url,
      location:locations!location_id(place_name, full_address, address_line1, city, state),
      source_product, source_record_type, source_record_id,
      created_by, created_at, updated_at, completed_at, cancelled_at,
      sitrep_assignments(user_id, role)
    `)
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("start_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (type)      query = query.eq("item_type", type);
  if (status)    query = query.eq("status", status);
  if (missionId) query = query.eq("mission_id", missionId);
  if (parentId === "root") {
    query = query.is("parent_item_id", null);
  } else if (parentId) {
    query = query.eq("parent_item_id", parentId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let items = ((data ?? []) as any[]).map((item) => {
    const loc = item.location;
    const location_display = loc
      ? ((loc.place_name ?? loc.address_line1 ?? loc.full_address ?? "") +
         (loc.city ? `, ${loc.city}` : "") +
         (loc.state ? `, ${loc.state}` : "")).trim() || null
      : null;
    return { ...item, location_display, location: undefined };
  });

  if (mine) {
    items = items.filter((item) => {
      if (item.created_by === crmUser.userId) return true;
      return item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId);
    });
  } else {
    items = items.filter((item) => {
      if (item.visibility === "private") return item.created_by === crmUser.userId;
      if (item.visibility === "assignee_only") {
        return (
          item.created_by === crmUser.userId ||
          item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId)
        );
      }
      return true;
    });
  }

  return NextResponse.json(items);
}

// POST /api/crm/sitrep/items
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim() || !body?.item_type) {
    return NextResponse.json({ error: "title and item_type are required" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  const SYSTEM_TYPES = ["task", "event", "meeting"];
  if (!SYSTEM_TYPES.includes(body.item_type)) {
    const { data: customTypes } = await sb
      .from("sitrep_item_types")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .eq("slug", body.item_type)
      .limit(1);
    if (!customTypes?.length) {
      return NextResponse.json({ error: "Invalid item_type" }, { status: 400 });
    }
  }

  // Resolve depth from parent
  let depth = 0;
  let resolvedParentId: string | null = body.parent_item_id ?? null;

  if (resolvedParentId) {
    const { data: parent } = await sb
      .from("sitrep_items")
      .select("id, depth")
      .eq("id", resolvedParentId)
      .eq("tenant_id", tenant.id)
      .single();

    if (!parent) {
      return NextResponse.json({ error: "Parent item not found" }, { status: 404 });
    }
    depth = (parent as any).depth + 1;
    if (depth > 3) {
      return NextResponse.json({ error: "Maximum nesting depth of 3 exceeded" }, { status: 400 });
    }
  }

  const { data: item, error } = await sb
    .from("sitrep_items")
    .insert({
      tenant_id:      tenant.id,
      squad_id:       body.squad_id       ?? null,
      item_type:      body.item_type,
      title:          body.title.trim(),
      description:    body.description    ?? null,
      status:         body.status         ?? (body.item_type === "task" ? "open" : null),
      priority:       body.item_type === "task" ? (body.priority ?? "normal") : null,
      due_date:       body.due_date        ?? null,
      start_at:       body.start_at        ?? null,
      end_at:         body.end_at          ?? null,
      is_all_day:     body.is_all_day      ?? false,
      agenda:         body.item_type === "meeting" ? (body.agenda ?? null) : null,
      meeting_notes:  null,
      mission_id:     body.mission_id      ?? null,
      parent_item_id: resolvedParentId,
      depth,
      visibility:     body.visibility      ?? "assignee_only",
      created_by:     crmUser.userId,
    })
    .select("id")
    .single();

  if (error || !item) {
    return NextResponse.json({ error: error?.message ?? "Failed to create item" }, { status: 500 });
  }

  const itemId = (item as any).id;

  // Insert assignments
  const assigneeIds: string[] = body.assignee_ids ?? [];
  if (assigneeIds.length > 0) {
    const roles: Record<string, string> = {
      task:    "assignee",
      event:   "attendee",
      meeting: "participant",
    };
    const assignmentRole = roles[body.item_type] ?? "assignee";
    await sb.from("sitrep_assignments").insert(
      assigneeIds.map((userId) => ({ item_id: itemId, user_id: userId, role: assignmentRole }))
    );
  }

  if (body.item_type === "meeting") {
    await sb.from("sitrep_assignments").upsert(
      { item_id: itemId, user_id: crmUser.userId, role: "organizer" },
      { onConflict: "item_id,user_id" }
    );
  }

  // Write activity log
  await sb.from("sitrep_activity").insert({
    tenant_id:  tenant.id,
    item_id:    itemId,
    actor_id:   crmUser.userId,
    event_type: "created",
    new_value:  body.title.trim(),
  });

  // Fire automations (non-blocking — errors are logged to sitrep_automation_runs)
  const createdItem = {
    id: itemId, tenant_id: tenant.id, squad_id: body.squad_id ?? null,
    item_type: body.item_type, title: body.title.trim(),
    status: body.status ?? (body.item_type === "task" ? "open" : null),
    priority: body.item_type === "task" ? (body.priority ?? "normal") : null,
    due_date: body.due_date ?? null, start_at: body.start_at ?? null,
    visibility: body.visibility ?? "assignee_only",
    created_by: crmUser.userId, sitrep_assignments: [],
  };
  void fireAutomations({ tenant_id: tenant.id, trigger_type: "item_created", item: createdItem });

  return NextResponse.json({ id: itemId, tenant_id: tenant.id, created: true });
}
