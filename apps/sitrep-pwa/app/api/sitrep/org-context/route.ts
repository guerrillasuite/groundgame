import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function sb() { return createClient(URL_, KEY); }

async function resolveNames(userIds: string[]): Promise<Record<string, { name: string; email: string }>> {
  const map: Record<string, { name: string; email: string }> = {};
  if (!userIds.length) return map;
  try {
    const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, {
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
    });
    if (res.ok) {
      const json = await res.json();
      for (const u of json.users ?? []) {
        if (userIds.includes(u.id)) {
          map[u.id] = {
            name:  u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? u.id,
            email: u.email ?? "",
          };
        }
      }
    }
  } catch { /* best-effort */ }
  return map;
}

// GET /api/sitrep/org-context?tenantId=xxx[&squadId=yyy]
// Returns { types: ItemType[], members: Member[] } for the given context.
// If squadId is provided, members are filtered to that squad only.
export async function GET(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  const squadId  = searchParams.get("squadId");

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const client = sb();

  const [typesRes, membersRes] = await Promise.all([
    client
      .from("sitrep_item_types")
      .select("id, name, slug, color, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order"),

    squadId
      ? client.from("squad_members").select("user_id").eq("squad_id", squadId)
      : client.from("user_tenants").select("user_id").eq("tenant_id", tenantId).in("status", ["active", "invited"]),
  ]);

  const types     = typesRes.data ?? [];
  const rawMembers = membersRes.data ?? [];
  const memberIds  = [...new Set((rawMembers as any[]).map((m) => m.user_id as string))];

  const nameMap = await resolveNames(memberIds);
  const members = memberIds.map((uid) => ({
    user_id: uid,
    name:    nameMap[uid]?.name  ?? uid,
    email:   nameMap[uid]?.email ?? "",
  }));

  return NextResponse.json({ types, members });
}
