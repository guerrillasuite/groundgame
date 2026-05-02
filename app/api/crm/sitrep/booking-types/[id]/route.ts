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

const ALLOWED_PATCH = [
  "title", "description", "duration_minutes", "buffer_before", "buffer_after",
  "available_days", "available_start", "available_end", "timezone",
  "sitrep_item_type", "confirmation_msg", "is_active", "conflict_item_types",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  for (const key of ALLOWED_PATCH) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);
  // Allow edit if you are the availability owner OR the person who created the page
  const { data, error } = await sb
    .from("sitrep_booking_types")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .or(`owner_id.eq.${crmUser.userId},created_by_id.eq.${crmUser.userId}`)
    .select("id, title, slug, is_active, duration_minutes, owner_id, created_by_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);
  // Allow delete if you are the availability owner OR the person who created the page
  const { error } = await sb
    .from("sitrep_booking_types")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .or(`owner_id.eq.${crmUser.userId},created_by_id.eq.${crmUser.userId}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
