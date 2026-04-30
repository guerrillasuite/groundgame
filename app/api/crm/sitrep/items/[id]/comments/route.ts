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

// GET /api/crm/sitrep/items/[id]/comments
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_comments")
    .select("id, author_id, body, edited_at, created_at")
    .eq("item_id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/crm/sitrep/items/[id]/comments
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.body?.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  // Verify item exists in tenant
  const { data: item } = await sb
    .from("sitrep_items")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { data: comment, error } = await sb
    .from("sitrep_comments")
    .insert({
      tenant_id: tenant.id,
      item_id:   id,
      author_id: crmUser.userId,
      body:      body.body.trim(),
    })
    .select("id, author_id, body, edited_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("sitrep_activity").insert({
    tenant_id:  tenant.id,
    item_id:    id,
    actor_id:   crmUser.userId,
    event_type: "commented",
    new_value:  (body.body as string).slice(0, 100),
  });

  return NextResponse.json(comment);
}
