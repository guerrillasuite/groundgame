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
  "mission_id", "visibility",
] as const;

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

  // Visibility check
  const i = item as any;
  if (i.visibility === "private" && i.created_by !== crmUser.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
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

  // Verify item belongs to tenant and user has access
  const { data: existing } = await sb
    .from("sitrep_items")
    .select("id, created_by, visibility, item_type")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of PATCHABLE) {
    if (key in body) patch[key] = body[key];
  }

  // Set completed_at / cancelled_at when status changes
  if (body.status === "done" && !(existing as any).completed_at) {
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
  return NextResponse.json({ ok: true });
}

// DELETE /api/crm/sitrep/items/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  // Only creator can delete
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

  const { error } = await sb
    .from("sitrep_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
