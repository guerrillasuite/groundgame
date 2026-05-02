import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/crm-auth";
import { makeAdminSb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const SYSTEM_SLUGS = new Set(["task", "event", "meeting"]);

// PATCH /api/admin/global-types/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireSuperAdminApi();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const sb = makeAdminSb();

  const allowed = ["name", "color", "icon", "is_mission_type", "show_in_kanban", "booking_enabled", "stages", "sort_order", "is_active"] as const;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }

  const { data, error } = await sb
    .from("sitrep_global_type_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/admin/global-types/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await requireSuperAdminApi();
  if (denied) return denied;

  const { id } = await params;
  const sb = makeAdminSb();

  const { data: tmpl } = await sb
    .from("sitrep_global_type_templates")
    .select("slug")
    .eq("id", id)
    .single();

  if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // System slugs: soft-delete only (set is_active = false)
  if (SYSTEM_SLUGS.has((tmpl as any).slug)) {
    // Ensure at least 1 active system default remains after deactivation
    const { count } = await sb
      .from("sitrep_global_type_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot deactivate the last active template" }, { status: 422 });
    }
    const { error } = await sb
      .from("sitrep_global_type_templates")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, soft: true });
  }

  // Custom templates: hard delete
  const { error } = await sb
    .from("sitrep_global_type_templates")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
