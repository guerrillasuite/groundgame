import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { sendEmail } from "@/lib/email/resend";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

// GET — list shares for a view (owner only)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: view } = await sb()
    .from("user_calendar_views")
    .select("id")
    .eq("id", id)
    .eq("owner_user_id", crmUser.userId)
    .maybeSingle();
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await sb()
    .from("calendar_view_shares")
    .select("id, shared_with_user_id, role, created_at")
    .eq("view_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — invite by email (creates invite row + sends email)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.email?.trim()) return NextResponse.json({ error: "email required" }, { status: 400 });

  // Verify ownership
  const { data: view } = await sb()
    .from("user_calendar_views")
    .select("id, name")
    .eq("id", id)
    .eq("owner_user_id", crmUser.userId)
    .maybeSingle();
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const email = body.email.trim().toLowerCase();
  const role  = body.role === "editor" ? "editor" : "viewer";

  // Create invite row
  const { data: invite, error: inviteErr } = await sb()
    .from("calendar_view_invites")
    .insert({ view_id: id, invited_by: crmUser.userId, email, role })
    .select("id, token")
    .single();

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  // Send invite email (best-effort)
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://guerrillasuite.com";
  const acceptUrl = `${origin}/calendar-invite/${invite.token}`;
  try {
    await sendEmail(
      email,
      `You've been invited to view a calendar: "${view.name}"`,
      `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;padding:40px">
        <div style="max-width:480px;margin:0 auto">
          <h2 style="color:#e6edf3">Calendar Invite</h2>
          <p>You've been invited to view <strong>${view.name}</strong> as a <strong>${role}</strong>.</p>
          <a href="${acceptUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            Accept Invite
          </a>
          <p style="margin-top:24px;font-size:12px;color:#8b949e">
            Or copy this link: ${acceptUrl}
          </p>
        </div>
      </body></html>`
    );
  } catch (e) {
    console.error("[calendar invite] email failed:", e);
  }

  return NextResponse.json({ invite_id: invite.id, accept_url: acceptUrl }, { status: 201 });
}

// DELETE — remove a share (owner only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { share_id } = await req.json().catch(() => ({}));
  if (!share_id) return NextResponse.json({ error: "share_id required" }, { status: 400 });

  // Verify ownership of view
  const { data: view } = await sb()
    .from("user_calendar_views")
    .select("id")
    .eq("id", id)
    .eq("owner_user_id", crmUser.userId)
    .maybeSingle();
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await sb()
    .from("calendar_view_shares")
    .delete()
    .eq("id", share_id)
    .eq("view_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
