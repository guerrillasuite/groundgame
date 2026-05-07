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

// PATCH — update detail_level or sort_order
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.detail_level !== undefined) update.detail_level = String(body.detail_level);
  if (body.sort_order   !== undefined) update.sort_order   = Number(body.sort_order);

  const { data, error } = await sb()
    .from("sitrep_favorites")
    .update(update)
    .eq("id", id)
    .eq("owner_user_id", user.userId)
    .select("id, favorite_user_id, detail_level, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

// DELETE — remove a favorite
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { error } = await sb()
    .from("sitrep_favorites")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
