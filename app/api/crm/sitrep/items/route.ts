import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

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
//   type        — 'task' | 'event' | 'meeting' (omit for all)
//   status      — 'open' | 'in_progress' | 'done' | 'cancelled'
//   mine        — 'true' → items where current user is creator or assignee
//   mission_id  — filter by mission
//   limit       — default 100
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);
  const { searchParams } = new URL(req.url);

  const type      = searchParams.get("type");
  const status    = searchParams.get("status");
  const mine      = searchParams.get("mine") === "true";
  const missionId = searchParams.get("mission_id");
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

  let query = sb
    .from("sitrep_items")
    .select(`
      id, tenant_id, item_type, title, description,
      status, priority, due_date,
      start_at, end_at, is_all_day,
      agenda, meeting_notes,
      mission_id, visibility,
      is_recurring,
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

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter to items the current user can see
  let items = (data ?? []) as any[];

  if (mine) {
    items = items.filter((item) => {
      if (item.created_by === crmUser.userId) return true;
      return item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId);
    });
  } else {
    // Apply visibility rules: exclude private items not created by current user
    items = items.filter((item) => {
      if (item.visibility === "private") return item.created_by === crmUser.userId;
      if (item.visibility === "assignee_only") {
        return (
          item.created_by === crmUser.userId ||
          item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId)
        );
      }
      // team and custom: visible (custom full enforcement requires visibility_grants lookup)
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

  const VALID_TYPES = ["task", "event", "meeting"] as const;
  if (!VALID_TYPES.includes(body.item_type)) {
    return NextResponse.json({ error: "Invalid item_type" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  const { data: item, error } = await sb
    .from("sitrep_items")
    .insert({
      tenant_id:   tenant.id,
      item_type:   body.item_type,
      title:       body.title.trim(),
      description: body.description ?? null,
      // Task fields
      status:   body.item_type === "task" ? (body.status ?? "open") : null,
      priority: body.item_type === "task" ? (body.priority ?? "normal") : null,
      due_date: body.item_type === "task" ? (body.due_date ?? null) : null,
      // Event/Meeting fields
      start_at:   body.start_at   ?? null,
      end_at:     body.end_at     ?? null,
      is_all_day: body.is_all_day ?? false,
      // Meeting fields
      agenda:        body.item_type === "meeting" ? (body.agenda ?? null) : null,
      meeting_notes: null,
      // Relationships
      mission_id: body.mission_id ?? null,
      visibility: body.visibility ?? "assignee_only",
      // Authorship
      created_by: crmUser.userId,
    })
    .select("id")
    .single();

  if (error || !item) {
    return NextResponse.json({ error: error?.message ?? "Failed to create item" }, { status: 500 });
  }

  // Insert assignments if provided
  const assigneeIds: string[] = body.assignee_ids ?? [];
  if (assigneeIds.length > 0) {
    const roles: Record<string, string> = {
      task:    "assignee",
      event:   "attendee",
      meeting: "participant",
    };
    const assignmentRole = roles[body.item_type] ?? "assignee";

    await sb.from("sitrep_assignments").insert(
      assigneeIds.map((userId) => ({
        item_id: (item as any).id,
        user_id: userId,
        role:    assignmentRole,
      }))
    );
  }

  // Creator is organizer for meetings
  if (body.item_type === "meeting") {
    await sb.from("sitrep_assignments").upsert({
      item_id: (item as any).id,
      user_id: crmUser.userId,
      role:    "organizer",
    }, { onConflict: "item_id,user_id" });
  }

  return NextResponse.json({ id: (item as any).id, created: true });
}
