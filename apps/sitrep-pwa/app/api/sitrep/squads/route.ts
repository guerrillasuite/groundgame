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

// GET — all squads this user is a member of
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await sb()
    .from("squad_members")
    .select("role, squads(id, name, color, is_default, sort_order, org_id)")
    .eq("user_id", user.userId)
    .order("squads(sort_order)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const squads = (data ?? []).map((m: any) => ({
    ...m.squads,
    role: m.role,
  }));

  return NextResponse.json(squads);
}

// POST — create a new squad
export async function POST(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const db = sb();

  const { data: squad, error: squadErr } = await db
    .from("squads")
    .insert({
      name:       body.name.trim(),
      created_by: user.userId,
      color:      body.color ?? "blue",
      sort_order: 99,
    })
    .select("id, name, color, is_default, sort_order")
    .single();

  if (squadErr) return NextResponse.json({ error: squadErr.message }, { status: 500 });

  await db.from("squad_members").insert({
    squad_id:   squad.id,
    user_id:    user.userId,
    role:       "owner",
    invited_by: user.userId,
  });

  return NextResponse.json({ ...squad, role: "owner" });
}
