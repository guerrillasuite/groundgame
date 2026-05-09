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
    .select("id, user_id, role, share_level, joined_at")
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
    pending: false,
  }));

  // Also return pending invites so the UI can show them
  const { data: pendingInvites } = await sb()
    .from("squad_invites")
    .select("id, token, email, phone, user_id, created_at")
    .eq("squad_id", id)
    .eq("status", "pending");

  const pending = (pendingInvites ?? []).map((inv: any) => ({
    id:         inv.id,
    token:      inv.token,
    user_id:    inv.user_id ?? null,
    role:       "pending",
    joined_at:  inv.created_at,
    name:       (inv.user_id ? nameMap[inv.user_id]?.name : null) ?? inv.email ?? inv.phone ?? "Invited",
    email:      inv.email ?? (inv.user_id ? nameMap[inv.user_id]?.email : null) ?? "",
    pending:    true,
  }));

  return NextResponse.json([...members, ...pending]);
}

// POST — create a pending squad invite (returns invite link, does not auto-add)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body?.email?.trim() && !body?.phone?.trim()) {
    return NextResponse.json({ error: "email or phone required" }, { status: 400 });
  }

  // Verify requester is owner or collaborator
  const { data: self } = await sb()
    .from("squad_members")
    .select("role")
    .eq("squad_id", id)
    .eq("user_id", user.userId)
    .single();

  if (!self || self.role === "viewer") return NextResponse.json({ error: "Insufficient role" }, { status: 403 });

  // Best-effort: look up existing user by email
  let inviteUserId: string | null = null;
  const email = body.email?.trim().toLowerCase() ?? null;
  if (email) {
    try {
      const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, {
        headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
      });
      if (res.ok) {
        const json = await res.json();
        const match = (json.users ?? []).find((u: any) => u.email === email);
        inviteUserId = match?.id ?? null;
      }
    } catch { /* best-effort */ }
  }

  // Get inviter's name for the message
  let inviterName = "A teammate";
  try {
    const res = await fetch(`${URL_}/auth/v1/admin/users/${user.userId}`, {
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
    });
    if (res.ok) {
      const u = await res.json();
      inviterName = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? inviterName;
    }
  } catch { /* best-effort */ }

  const { data: squad } = await sb().from("squads").select("name").eq("id", id).maybeSingle();
  const squadName = (squad as any)?.name ?? "the squad";

  const { data: invite, error } = await sb()
    .from("squad_invites")
    .insert({
      squad_id:   id,
      invited_by: user.userId,
      email:      email ?? null,
      phone:      body.phone?.trim() ?? null,
      user_id:    inviteUserId,
    })
    .select("token")
    .single();

  if (error || !invite) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

  const inviteUrl = `https://app.sitrep.digital/join/${(invite as any).token}`;
  const message   = `${inviterName} invited you to join ${squadName} on SitRep.\nTap here to accept: ${inviteUrl}`;

  return NextResponse.json({ token: (invite as any).token, inviteUrl, message, squadName, inviterName });
}

// PATCH — update own share_level
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const shareLevel = body?.share_level;
  if (!["full", "basic", "busy"].includes(shareLevel)) {
    return NextResponse.json({ error: "share_level must be full, basic, or busy" }, { status: 400 });
  }

  const { error } = await sb()
    .from("squad_members")
    .update({ share_level: shareLevel })
    .eq("squad_id", id)
    .eq("user_id", user.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a member (owner removes anyone; any member removes themselves)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);

  // Revoke a pending invite (owner only)
  if (body?.invite_id) {
    const { data: self } = await sb()
      .from("squad_members")
      .select("role")
      .eq("squad_id", id)
      .eq("user_id", user.userId)
      .single();
    if (!self || self.role === "viewer") return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
    const { error } = await sb().from("squad_invites").delete().eq("id", body.invite_id).eq("squad_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const targetUserId: string = body?.user_id ?? user.userId;

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
