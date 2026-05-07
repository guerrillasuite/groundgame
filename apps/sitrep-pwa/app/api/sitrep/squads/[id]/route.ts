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

// PATCH — update name or color (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.name)  update.name  = String(body.name).trim();
  if (body.color) update.color = String(body.color);
  update.updated_at = new Date().toISOString();

  const { data, error } = await sb()
    .from("squads")
    .update(update)
    .eq("id", id)
    .eq("created_by", user.userId)
    .select("id, name, color, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });

  return NextResponse.json(data);
}

// DELETE — delete squad (owner only)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { error } = await sb()
    .from("squads")
    .delete()
    .eq("id", id)
    .eq("created_by", user.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
