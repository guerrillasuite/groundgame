import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sb() { return createClient(URL_, KEY); }

// GET — list members of a squad
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Verify requester is a member
  const { data: self } = await sb()
    .from("squad_members")
    .select("role")
    .eq("squad_id", id)
    .eq("user_id", user.userId)
    .single();

  if (!self) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data, error } = await sb()
    .from("squad_members")
    .select("id, user_id, role, joined_at")
    .eq("squad_id", id)
    .order("joined_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve user names from auth admin API
  let nameMap: Record<string, { name: string; email: string }> = {};
  try {
    const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, {
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
    });
    if (res.ok) {
      const json = await res.json();
      for (const u of json.users ?? []) {
        nameMap[u.id] = {
          name:  u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? u.id,
          email: u.email ?? "",
        };
      }
    }
  } catch { /* best-effort */ }

  const members = (data ?? []).map((m: any) => ({
    ...m,
    name:  nameMap[m.user_id]?.name  ?? m.user_id,
    email: nameMap[m.user_id]?.email ?? "",
  }));

  return NextResponse.json(members);
}

// POST — invite a user to the squad by email
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body?.email?.trim()) return NextResponse.json({ error: "email required" }, { status: 400 });

  // Verify requester is owner or collaborator
  const { data: self } = await sb()
    .from("squad_members")
    .select("role")
    .eq("squad_id", id)
    .eq("user_id", user.userId)
    .single();

  if (!self || self.role === "viewer") return NextResponse.json({ error: "Insufficient role" }, { status: 403 });

  // Look up user by email via admin API
  let inviteUserId: string | null = null;
  try {
    const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, {
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
    });
    if (res.ok) {
      const json = await res.json();
      const match = (json.users ?? []).find((u: any) => u.email === body.email.trim().toLowerCase());
      inviteUserId = match?.id ?? null;
    }
  } catch { /* ignore */ }

  if (!inviteUserId) {
    return NextResponse.json({ error: "No account found with that email" }, { status: 404 });
  }

  const { error } = await sb()
    .from("squad_members")
    .upsert({
      squad_id:   id,
      user_id:    inviteUserId,
      role:       body.role ?? "collaborator",
      invited_by: user.userId,
    }, { onConflict: "squad_id,user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE — remove a member from the squad (owner removes anyone; any member removes themselves)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const targetUserId: string = body?.user_id ?? user.userId;

  // Verify requester is owner OR is removing themselves
  if (targetUserId !== user.userId) {
    const { data: self } = await sb()
      .from("squad_members")
      .select("role")
      .eq("squad_id", id)
      .eq("user_id", user.userId)
      .single();
    if (!self || self.role === "viewer") return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
  }

  const { error } = await sb()
    .from("squad_members")
    .delete()
    .eq("squad_id", id)
    .eq("user_id", targetUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
