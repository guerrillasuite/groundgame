import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import type { SitRepView } from "@/lib/sitrep-calendar-filter";

export const dynamic = "force-dynamic";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const SELECT = "id, name, toggle_state, is_default, sort_order";

// GET — all views for the current user
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await sb()
    .from("sitrep_views")
    .select(SELECT)
    .eq("owner_user_id", user.userId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create a new view
export async function POST(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const db = sb();
  const { data: maxOrder } = await db
    .from("sitrep_views")
    .select("sort_order")
    .eq("owner_user_id", user.userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await db
    .from("sitrep_views")
    .insert({
      owner_user_id: user.userId,
      name:          body.name.trim(),
      toggle_state:  body.toggle_state ?? { org_ids: [], squad_ids: [], personal: false, favorite_ids: [], filters: { item_types: [], statuses: [], show_completed: true } },
      is_default:    body.is_default ?? false,
      sort_order:    ((maxOrder as any)?.sort_order ?? 0) + 1,
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
