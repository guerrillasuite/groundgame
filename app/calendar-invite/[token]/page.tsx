export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import InviteAcceptClient from "./InviteAcceptClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sb() { return createClient(SUPABASE_URL, SERVICE_KEY); }

export default async function CalendarInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: invite } = await sb()
    .from("calendar_view_invites")
    .select("id, view_id, email, role, status, user_calendar_views(id, name, color, user_calendar_types(name, color, owner_user_id))")
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

  const view    = (invite as any).user_calendar_views ?? {};
  const calType = view.user_calendar_types ?? {};

  // Best-effort owner name
  let ownerName = "A teammate";
  if (calType.owner_user_id) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${calType.owner_user_id}`, {
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      if (res.ok) {
        const u = await res.json();
        ownerName = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? ownerName;
      }
    } catch { /* best-effort */ }
  }

  return (
    <InviteAcceptClient
      token={token}
      inviteEmail={invite.email}
      inviteRole={invite.role as "viewer" | "editor"}
      inviteStatus={invite.status as "pending" | "accepted" | "declined"}
      viewName={view.name ?? "a calendar view"}
      viewColor={view.color ?? calType.color ?? "blue"}
      typeName={calType.name ?? "Calendar"}
      ownerName={ownerName}
    />
  );
}
