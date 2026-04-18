import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// No auth — this is a public read-only API for embedded calendars.

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;

  // Resolve calendar config using service role (no tenant header yet)
  const sbGlobal = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: cal, error: calErr } = await sbGlobal
    .from("sitrep_public_calendars")
    .select("id, tenant_id, name, include_type_slugs, include_statuses, show_day, show_week, show_month, default_view")
    .eq("token", token)
    .single();

  if (calErr || !cal) {
    return NextResponse.json({ error: "Calendar not found" }, { status: 404 });
  }

  const sb = makeSb(cal.tenant_id);

  let query = sb
    .from("sitrep_items")
    .select("id, item_type, title, status, due_date, start_at, end_at, is_all_day, location, location_address, description, visibility")
    .eq("tenant_id", cal.tenant_id)
    .eq("visibility", "team") // public calendars only show team-visible items
    .order("start_at", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);

  if (cal.include_type_slugs?.length > 0) {
    query = query.in("item_type", cal.include_type_slugs);
  }
  if (cal.include_statuses?.length > 0) {
    query = query.in("status", cal.include_statuses);
  }

  // Fetch type colors for the tenant
  const { data: typesData } = await sb
    .from("sitrep_item_types")
    .select("slug, color")
    .eq("tenant_id", cal.tenant_id)
    .eq("is_public", true);

  const typeColors: Record<string, string> = {};
  for (const t of typesData ?? []) {
    if (t.slug && t.color) typeColors[t.slug] = t.color;
  }

  const { data: items, error: itemsErr } = await query;
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  // Return only public-safe fields
  const safeItems = (items ?? []).map((i: any) => ({
    id: i.id,
    item_type: i.item_type,
    title: i.title,
    status: i.status,
    due_date: i.due_date,
    start_at: i.start_at,
    end_at: i.end_at,
    is_all_day: i.is_all_day,
    location: i.location ?? null,
    location_address: i.location_address ?? null,
    description: i.description ?? null,
  }));

  return NextResponse.json({
    calendar: {
      name: cal.name,
      show_day: cal.show_day,
      show_week: cal.show_week,
      show_month: cal.show_month,
      default_view: cal.default_view,
    },
    items: safeItems,
    typeColors,
  });
}
