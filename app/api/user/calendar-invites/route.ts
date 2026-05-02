import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

export type PendingInvite = {
  id:         string;
  token:      string;
  role:       "viewer" | "editor";
  view_name:  string;
  view_color: string;
  type_name:  string;
  owner_name: string;
};

// GET — list pending calendar-view invites addressed to the logged-in user's email
export async function GET() {
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve the user's email via auth admin API
  let email: string | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${crmUser.userId}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (res.ok) email = (await res.json()).email ?? null;
  } catch { /* best-effort */ }

  if (!email) return NextResponse.json([]);

  const { data: invites } = await sb()
    .from("calendar_view_invites")
    .select("id, token, role, user_calendar_views(name, color, user_calendar_types(name, color, owner_user_id))")
    .eq("email", email)
    .eq("status", "pending");

  if (!invites?.length) return NextResponse.json([]);

  // Collect unique owner IDs for bulk name lookup
  const ownerIds = [...new Set(
    invites.map((inv: any) => inv.user_calendar_views?.user_calendar_types?.owner_user_id).filter(Boolean)
  )];

  const nameMap: Record<string, string> = {};
  await Promise.all(ownerIds.map(async (uid: string) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      if (res.ok) {
        const u = await res.json();
        nameMap[uid] = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? "Someone";
      }
    } catch { /* best-effort */ }
  }));

  const result: PendingInvite[] = invites.map((inv: any) => {
    const view    = inv.user_calendar_views ?? {};
    const calType = view.user_calendar_types ?? {};
    return {
      id:         inv.id,
      token:      inv.token,
      role:       inv.role,
      view_name:  view.name  ?? "Untitled view",
      view_color: view.color ?? calType.color ?? "blue",
      type_name:  calType.name ?? "Calendar",
      owner_name: nameMap[calType.owner_user_id] ?? "Someone",
    };
  });

  return NextResponse.json(result);
}
