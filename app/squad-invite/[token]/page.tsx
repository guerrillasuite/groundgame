export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import SquadInviteClient from "./SquadInviteClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function sb() { return createClient(SUPABASE_URL, SERVICE_KEY); }

export default async function SquadInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: invite } = await sb()
    .from("squad_invites")
    .select("id, invited_by, status, squads(name, color)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "rgb(10 13 20)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: "center", color: "rgb(160 174 192)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "rgb(238 242 246)", margin: "0 0 8px" }}>Invite not found</h1>
          <p style={{ margin: 0, fontSize: 14 }}>This link is invalid or has already expired.</p>
        </div>
      </div>
    );
  }

  const squad = (invite as any).squads ?? {};

  let inviterName = "A teammate";
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${invite.invited_by}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (res.ok) {
      const u = await res.json();
      inviterName = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? inviterName;
    }
  } catch { /* best-effort */ }

  return (
    <SquadInviteClient
      token={token}
      squadName={squad.name ?? "a squad"}
      squadColor={squad.color ?? "blue"}
      inviterName={inviterName}
      inviteStatus={invite.status as "pending" | "accepted" | "declined"}
    />
  );
}
