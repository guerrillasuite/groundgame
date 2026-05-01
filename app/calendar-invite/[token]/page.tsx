export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import InviteAcceptClient from "./InviteAcceptClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function CalendarInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: invite } = await sb
    .from("calendar_view_invites")
    .select("id, view_id, email, role, status, user_calendar_views(name, owner_user_id)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <div style={{ minHeight: "100vh", background: "rgb(10 13 20)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "rgb(160 174 192)", fontFamily: "sans-serif" }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: "rgb(220 38 38)" }}>Invalid or expired invite link.</p>
        </div>
      </div>
    );
  }

  const viewName   = (invite.user_calendar_views as any)?.name ?? "a calendar";
  const alreadyDone = invite.status !== "pending";

  if (alreadyDone) {
    return (
      <InviteAcceptClient
        token={token}
        viewName={viewName}
        role={invite.role}
        email={invite.email}
        alreadyHandled={invite.status}
      />
    );
  }

  return (
    <InviteAcceptClient
      token={token}
      viewName={viewName}
      role={invite.role}
      email={invite.email}
      alreadyHandled={null}
    />
  );
}
