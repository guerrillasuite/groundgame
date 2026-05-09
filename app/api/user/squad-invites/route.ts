import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

export type PendingSquadInvite = {
  id:          string;
  token:       string;
  squadId:     string;
  squadName:   string;
  squadColor:  string;
  inviterName: string;
  createdAt:   string;
};

// GET — list pending squad invites for the logged-in user
export async function GET() {
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve the user's email (for invites addressed by email)
  let email: string | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${crmUser.userId}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (res.ok) email = (await res.json()).email ?? null;
  } catch { /* best-effort */ }

  // Fetch pending invites addressed to this user_id or email
  const byUserId = sb().from("squad_invites")
    .select("id, token, squad_id, invited_by, created_at, squads(name, color)")
    .eq("user_id", crmUser.userId)
    .eq("status", "pending");

  const byEmail = email
    ? sb().from("squad_invites")
        .select("id, token, squad_id, invited_by, created_at, squads(name, color)")
        .eq("email", email)
        .eq("status", "pending")
    : null;

  const results = await Promise.all([byUserId, ...(byEmail ? [byEmail] : [])]);
  const seen = new Set<string>();
  const invites: any[] = [];
  for (const { data } of results) {
    for (const inv of data ?? []) {
      if (!seen.has(inv.id)) { seen.add(inv.id); invites.push(inv); }
    }
  }

  if (!invites.length) return NextResponse.json([]);

  // Bulk-resolve inviter names
  const inviterIds = Array.from(new Set(invites.map((i) => i.invited_by)));
  const nameMap: Record<string, string> = {};
  await Promise.all(inviterIds.map(async (uid) => {
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

  const result: PendingSquadInvite[] = invites.map((inv) => {
    const squad = inv.squads ?? {};
    return {
      id:          inv.id,
      token:       inv.token,
      squadId:     inv.squad_id,
      squadName:   squad.name  ?? "a squad",
      squadColor:  squad.color ?? "blue",
      inviterName: nameMap[inv.invited_by] ?? "Someone",
      createdAt:   inv.created_at,
    };
  });

  return NextResponse.json(result);
}
