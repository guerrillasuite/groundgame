import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sb() { return createClient(URL_, KEY); }

const SELECT = "id, tenant_id, squad_id, item_type, title, status, priority, due_date, start_at, end_at, is_all_day, visibility, created_by, sitrep_assignments(user_id, role)";

// GET — fetch items for a list of favorite users to overlay on the calendar
// ?userIds=id1,id2
export async function GET(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("userIds") ?? "";
  const userIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (userIds.length === 0) return NextResponse.json([]);

  // Resolve shared-context users (tenant co-members + explicit favorites)
  const { data: myTenants } = await sb()
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", user.userId)
    .in("status", ["active", "invited"]);
  const myTenantIds = (myTenants ?? []).map((r: any) => r.tenant_id as string);

  const allowedIds = new Set<string>();
  if (myTenantIds.length > 0) {
    const { data: coMembers } = await sb()
      .from("user_tenants")
      .select("user_id")
      .in("tenant_id", myTenantIds)
      .in("status", ["active", "invited"]);
    for (const r of coMembers ?? []) allowedIds.add(r.user_id);
  }
  const { data: favRows } = await sb()
    .from("sitrep_favorites")
    .select("favorite_user_id")
    .eq("owner_user_id", user.userId)
    .in("favorite_user_id", userIds);
  for (const f of favRows ?? []) allowedIds.add(f.favorite_user_id);

  const filteredIds = userIds.filter((id) => allowedIds.has(id));
  if (filteredIds.length === 0) return NextResponse.json([]);

  const { data, error } = await sb()
    .from("sitrep_items")
    .select(SELECT)
    .in("created_by", filteredIds)
    .neq("visibility", "private")
    .order("start_at", { ascending: true, nullsFirst: false })
    .order("due_date",  { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
