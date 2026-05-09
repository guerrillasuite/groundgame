import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

async function resolveUserName(userId: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (res.ok) {
      const u = await res.json();
      return u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? "Someone";
    }
  } catch { /* best-effort */ }
  return "Someone";
}

// GET /api/squad-invite/[token] — public, returns invite details
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: invite } = await sb()
    .from("squad_invites")
    .select("id, squad_id, invited_by, status, squads(name, color)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });

  const squad = (invite as any).squads ?? {};
  const inviterName = await resolveUserName(invite.invited_by);

  return NextResponse.json({
    squadName:   squad.name  ?? "a squad",
    squadColor:  squad.color ?? "blue",
    inviterName,
    status:      invite.status,
  });
}

// POST /api/squad-invite/[token]  { action: "accept" | "decline" }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body   = await req.json().catch(() => null);
  const action: "accept" | "decline" = body?.action === "decline" ? "decline" : "accept";

  const { data: invite } = await sb()
    .from("squad_invites")
    .select("id, squad_id, invited_by, status")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });

  if (invite.status !== "pending") {
    return NextResponse.json({ already: invite.status, squadId: invite.squad_id });
  }

  const now = new Date().toISOString();

  if (action === "decline") {
    await sb().from("squad_invites").update({ status: "declined", accepted_at: now }).eq("id", invite.id);
    return NextResponse.json({ status: "declined" });
  }

  // Accept requires auth
  const crmUser = await getCrmUser().catch(() => null);
  if (!crmUser) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });

  await Promise.all([
    sb().from("squad_invites").update({ status: "accepted", accepted_at: now, user_id: crmUser.userId }).eq("id", invite.id),
    sb().from("squad_members").upsert({
      squad_id:   invite.squad_id,
      user_id:    crmUser.userId,
      role:       "collaborator",
      invited_by: invite.invited_by,
    }, { onConflict: "squad_id,user_id" }),
    sb().from("sitrep_favorites").upsert({
      owner_user_id:    crmUser.userId,
      favorite_user_id: invite.invited_by,
      detail_level:     "basic",
    }, { onConflict: "owner_user_id,favorite_user_id" }),
  ]);

  return NextResponse.json({ status: "accepted", squadId: invite.squad_id });
}
