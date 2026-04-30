import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; comment_id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// PATCH /api/crm/sitrep/items/[id]/comments/[comment_id]
// Body: { body }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, comment_id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.body?.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  const { data: comment } = await sb
    .from("sitrep_comments")
    .select("author_id")
    .eq("id", comment_id)
    .eq("item_id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((comment as any).author_id !== crmUser.userId) {
    return NextResponse.json({ error: "Only the author can edit this comment" }, { status: 403 });
  }

  const { error } = await sb
    .from("sitrep_comments")
    .update({ body: body.body.trim(), edited_at: new Date().toISOString() })
    .eq("id", comment_id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/crm/sitrep/items/[id]/comments/[comment_id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, comment_id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data: comment } = await sb
    .from("sitrep_comments")
    .select("author_id")
    .eq("id", comment_id)
    .eq("item_id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = (comment as any).author_id === crmUser.userId;
  if (!isAuthor && crmUser.role !== "director" && !crmUser.isSuperAdmin) {
    return NextResponse.json({ error: "Not authorized to delete this comment" }, { status: 403 });
  }

  const { error } = await sb
    .from("sitrep_comments")
    .delete()
    .eq("id", comment_id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
