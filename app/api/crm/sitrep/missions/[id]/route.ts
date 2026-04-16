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

const PATCHABLE = ["title", "description", "status", "due_date", "visibility"] as const;

// GET /api/crm/sitrep/missions/[id]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const [{ data: mission, error }, { data: items }] = await Promise.all([
    sb
      .from("sitrep_missions")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .single(),
    sb
      .from("sitrep_items")
      .select("id, item_type, title, status, priority, due_date, start_at, end_at, created_by, sitrep_assignments(user_id, role)")
      .eq("mission_id", id)
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);

  if (error || !mission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const m = mission as any;
  if (m.visibility === "private" && m.created_by !== crmUser.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Calculate progress: % of linked tasks in 'done'
  const tasks = (items ?? []).filter((i: any) => i.item_type === "task");
  const doneTasks = tasks.filter((i: any) => i.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

  return NextResponse.json({ ...m, items: items ?? [], progress });
}

// PATCH /api/crm/sitrep/missions/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const sb = makeSb(tenant.id);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of PATCHABLE) {
    if (key in body) patch[key] = body[key];
  }

  if (body.status === "complete") patch.completed_at = new Date().toISOString();
  if (body.status === "archived") patch.archived_at  = new Date().toISOString();

  const { error } = await sb
    .from("sitrep_missions")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/crm/sitrep/missions/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data: existing } = await sb
    .from("sitrep_missions")
    .select("created_by")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((existing as any).created_by !== crmUser.userId && !crmUser.isSuperAdmin) {
    return NextResponse.json({ error: "Only the creator can delete this mission" }, { status: 403 });
  }

  // Items with mission_id will have it SET NULL (ON DELETE SET NULL)
  const { error } = await sb
    .from("sitrep_missions")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
