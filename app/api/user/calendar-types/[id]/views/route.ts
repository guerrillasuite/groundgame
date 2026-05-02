import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VIEW_SELECT = "id, calendar_type_id, name, color, filter_config, is_default, sort_order";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: typeId } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: type } = await sb()
    .from("user_calendar_types")
    .select("id")
    .eq("id", typeId)
    .eq("owner_user_id", crmUser.userId)
    .maybeSingle();
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await sb()
    .from("user_calendar_views")
    .select(VIEW_SELECT)
    .eq("calendar_type_id", typeId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: typeId } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Verify ownership
  const { data: type } = await sb()
    .from("user_calendar_types")
    .select("id")
    .eq("id", typeId)
    .eq("owner_user_id", crmUser.userId)
    .maybeSingle();
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await sb()
    .from("user_calendar_views")
    .insert({
      calendar_type_id: typeId,
      owner_user_id:    crmUser.userId,
      name:             body.name.trim(),
      color:            body.color ?? null,
      filter_config:    body.filter_config ?? {},
      is_default:       body.is_default ?? false,
      sort_order:       body.sort_order ?? 99,
    })
    .select(VIEW_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
