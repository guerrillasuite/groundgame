import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST /api/calendar-invite/[token]  { action: "accept" | "decline" }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const action: "accept" | "decline" = body?.action === "decline" ? "decline" : "accept";

  const { data: invite } = await sb()
    .from("calendar_view_invites")
    .select("id, view_id, invited_by, role, status")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (invite.status !== "pending") {
    return NextResponse.json({ already: invite.status, view_id: invite.view_id }, { status: 200 });
  }

  const now = new Date().toISOString();

  if (action === "decline") {
    await sb()
      .from("calendar_view_invites")
      .update({ status: "declined", accepted_at: now })
      .eq("id", invite.id);
    return NextResponse.json({ status: "declined" });
  }

  // Accept: must be logged in to create the share row
  const crmUser = await getCrmUser().catch(() => null);
  if (!crmUser) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  // Mark invite accepted and create the share row
  await Promise.all([
    sb()
      .from("calendar_view_invites")
      .update({ status: "accepted", accepted_at: now })
      .eq("id", invite.id),
    sb()
      .from("calendar_view_shares")
      .upsert({
        view_id:             invite.view_id,
        shared_with_user_id: crmUser.userId,
        role:                invite.role,
      }, { onConflict: "view_id,shared_with_user_id" }),
  ]);

  return NextResponse.json({ status: "accepted", view_id: invite.view_id });
}
