import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSb(tenantId: string) {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { "X-Tenant-Id": tenantId } },
  });
}

const SELECT = "id, tenant_id, owner_id, title, slug, description, duration_minutes, buffer_before, buffer_after, available_days, available_start, available_end, timezone, sitrep_item_type, confirmation_msg, is_active, conflict_item_types, created_at";

export async function GET() {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("sitrep_booking_types")
    .select(SELECT)
    .eq("tenant_id", tenant.id)
    .eq("owner_id", crmUser.userId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const baseSlug = (body.slug?.trim() || body.title.trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const sb = makeSb(tenant.id);

  // Ensure globally unique slug (try base, then base-2, base-3, …)
  let slug = baseSlug;
  for (let i = 2; i <= 20; i++) {
    const { data: existing } = await createClient(SUPABASE_URL, SERVICE_KEY)
      .from("sitrep_booking_types")
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data, error } = await sb
    .from("sitrep_booking_types")
    .insert({
      tenant_id:        tenant.id,
      owner_id:         crmUser.userId,
      title:            body.title.trim(),
      slug,
      description:      body.description?.trim() ?? null,
      duration_minutes: body.duration_minutes ?? 30,
      buffer_before:    body.buffer_before ?? 0,
      buffer_after:     body.buffer_after ?? 0,
      available_days:   body.available_days ?? [1, 2, 3, 4, 5],
      available_start:  body.available_start ?? "09:00",
      available_end:    body.available_end ?? "17:00",
      timezone:         body.timezone ?? "America/New_York",
      sitrep_item_type:     body.sitrep_item_type ?? "meeting",
      confirmation_msg:     body.confirmation_msg?.trim() ?? null,
      is_active:            body.is_active !== false,
      conflict_item_types:  body.conflict_item_types ?? ["meeting", "event"],
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
