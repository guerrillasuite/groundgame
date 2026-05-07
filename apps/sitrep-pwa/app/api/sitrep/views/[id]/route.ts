import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const SELECT = "id, name, toggle_state, is_default, sort_order";

// PATCH — update name, toggle_state, or is_default
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name          !== undefined) update.name          = String(body.name).trim();
  if (body.toggle_state  !== undefined) update.toggle_state  = body.toggle_state;
  if (body.is_default    !== undefined) update.is_default    = Boolean(body.is_default);
  if (body.sort_order    !== undefined) update.sort_order    = Number(body.sort_order);

  const { data, error } = await sb()
    .from("sitrep_views")
    .update(update)
    .eq("id", id)
    .eq("owner_user_id", user.userId)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

// DELETE — delete a view (cannot delete if it's the only one)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = sb();

  const { count } = await db
    .from("sitrep_views")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.userId);

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Cannot delete your only view" }, { status: 400 });
  }

  const { error } = await db
    .from("sitrep_views")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
