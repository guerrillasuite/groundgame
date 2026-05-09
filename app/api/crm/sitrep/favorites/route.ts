import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sb() { return createClient(URL_, KEY); }

const SELECT = "id, favorite_user_id, detail_level, sort_order";

// GET — list contacts: all tenant co-members + explicit favorites
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = sb();

  // Resolve tenant IDs the current user belongs to
  const { data: myTenants } = await db
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", user.userId)
    .in("status", ["active", "invited"]);
  const myTenantIds = (myTenants ?? []).map((r: any) => r.tenant_id as string);

  // Get all co-member user IDs (excluding self)
  const coMemberIds = new Set<string>();
  if (myTenantIds.length > 0) {
    const { data: coMembers } = await db
      .from("user_tenants")
      .select("user_id")
      .in("tenant_id", myTenantIds)
      .in("status", ["active", "invited"]);
    for (const r of coMembers ?? []) {
      if (r.user_id !== user.userId) coMemberIds.add(r.user_id);
    }
  }

  // Get existing explicit favorites
  const { data: favData, error } = await db
    .from("sitrep_favorites")
    .select(SELECT)
    .eq("owner_user_id", user.userId)
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const explicitMap = new Map<string, any>();
  for (const f of favData ?? []) explicitMap.set(f.favorite_user_id, f);

  // Merge: co-members without a favorites row get default settings
  const allUserIds = new Set([...coMemberIds, ...explicitMap.keys()]);

  // Resolve display names
  const nameMap: Record<string, string> = {};
  try {
    const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, {
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
    });
    if (res.ok) {
      const json = await res.json();
      for (const u of json.users ?? []) {
        nameMap[u.id] = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? u.id;
      }
    }
  } catch { /* best-effort */ }

  const result = [...allUserIds].map((uid) => {
    const explicit = explicitMap.get(uid);
    return explicit
      ? { ...explicit, name: nameMap[uid] ?? uid }
      : { id: null, favorite_user_id: uid, detail_level: "busy", sort_order: null, name: nameMap[uid] ?? uid };
  }).sort((a, b) => {
    // explicit favorites first, then alphabetical
    if (a.id && !b.id) return -1;
    if (!a.id && b.id) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return NextResponse.json(result);
}

// POST — add a favorite
export async function POST(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  let favoriteUserId: string | null = body?.favorite_user_id ?? null;

  // Allow adding by email (look up user_id from auth admin)
  if (!favoriteUserId && body?.email?.trim()) {
    try {
      const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, {
        headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
      });
      if (res.ok) {
        const json = await res.json();
        const match = (json.users ?? []).find((u: any) => u.email === body.email.trim().toLowerCase());
        favoriteUserId = match?.id ?? null;
      }
    } catch { /* ignore */ }
    if (!favoriteUserId) return NextResponse.json({ error: "No account found with that email" }, { status: 404 });
  }

  if (!favoriteUserId) return NextResponse.json({ error: "favorite_user_id or email required" }, { status: 400 });

  const db = sb();
  const { data: maxOrder } = await db
    .from("sitrep_favorites")
    .select("sort_order")
    .eq("owner_user_id", user.userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await db
    .from("sitrep_favorites")
    .upsert({
      owner_user_id:    user.userId,
      favorite_user_id: favoriteUserId,
      detail_level:     body.detail_level ?? "busy",
      sort_order:       ((maxOrder as any)?.sort_order ?? 0) + 1,
    }, { onConflict: "owner_user_id,favorite_user_id" })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
