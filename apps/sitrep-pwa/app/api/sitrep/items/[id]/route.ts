import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { makeServiceSb } from "@/lib/tenant";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = `
  id, item_type, title, description, location, status, priority,
  due_date, start_at, end_at, is_all_day,
  mission_id, parent_item_id, depth,
  visibility, created_by, created_at, updated_at,
  sitrep_assignments(user_id, role)
`;

const PATCHABLE = [
  "title", "description", "status", "priority",
  "due_date", "start_at", "end_at", "is_all_day",
  "location", "visibility", "parent_item_id",
] as const;

// GET /api/sitrep/items/[id]?tenantId=xxx
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const sb = makeServiceSb(tenantId);
  const { data, error } = await sb
    .from("sitrep_items")
    .select(`${SELECT}, sitrep_comments(id, body, author_id, created_at), sitrep_activity(id, event_type, old_value, new_value, actor_id, created_at)`)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = data as any;
  if (item.visibility === "private" && item.created_by !== user.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

// PATCH /api/sitrep/items/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  // tenantId may be null for personal (tenant-less) items
  const tenantId: string | null = body?.tenantId ?? null;

  const sb = tenantId ? makeServiceSb(tenantId) : makeAdminSb();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of PATCHABLE) {
    if (key in body) patch[key] = body[key];
  }

  if (body.status === "done") patch.completed_at = new Date().toISOString();
  if (body.status === "cancelled") patch.cancelled_at = new Date().toISOString();

  let updateQ = sb.from("sitrep_items").update(patch).eq("id", id);
  if (tenantId) updateQ = updateQ.eq("tenant_id", tenantId);

  const { error } = await updateQ;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activity log for tracked fields (only when tenant exists)
  if (tenantId) {
    const TRACKED: Record<string, string> = {
      status: "status_changed", due_date: "due_changed", title: "title_changed",
    };
    const actRows = Object.entries(TRACKED)
      .filter(([k]) => k in body)
      .map(([k, evt]) => ({
        tenant_id: tenantId, item_id: id, actor_id: user.userId,
        event_type: evt, new_value: body[k] != null ? String(body[k]) : null,
      }));
    if (actRows.length) await sb.from("sitrep_activity").insert(actRows).catch(() => {});
  }

  // Return the updated item so the client can update local state without a full refetch
  const { data: updated } = await sb
    .from("sitrep_items")
    .select(SELECT)
    .eq("id", id)
    .single();

  return NextResponse.json(updated ?? { id, ...patch });
}

// DELETE /api/sitrep/items/[id]
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tenantId = body.tenantId;
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const sb = makeServiceSb(tenantId);

  const { data: existing } = await sb
    .from("sitrep_items")
    .select("created_by")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((existing as any).created_by !== user.userId && !user.isSuperAdmin) {
    return NextResponse.json({ error: "Only the creator can delete" }, { status: 403 });
  }

  // Orphan children rather than cascade — safer default from mobile
  await sb.from("sitrep_items")
    .update({ parent_item_id: null, depth: 0 })
    .eq("parent_item_id", id)
    .eq("tenant_id", tenantId);

  const { error } = await sb.from("sitrep_items").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
