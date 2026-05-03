import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const SELECT = "id, tenant_id, item_type, title, status, priority, due_date, start_at, end_at, is_all_day, visibility, created_by, sitrep_assignments(user_id, role)";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function fetchItemsByIds(sb: ReturnType<typeof makeAdminSb>, ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const CHUNK = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) => sb.from("sitrep_items").select(SELECT).in("id", chunk).limit(CHUNK))
  );
  return results.flatMap((r) => r.data ?? []);
}

export async function GET() {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = makeAdminSb();

  // 1. Get this user's shared views
  const { data: shares } = await db
    .from("calendar_view_shares")
    .select("id, role, view_id")
    .eq("shared_with_user_id", user.userId);

  if (!shares || shares.length === 0) return NextResponse.json([]);

  const viewIds = (shares as any[]).map((s) => s.view_id);

  const { data: views } = await db
    .from("user_calendar_views")
    .select("id, calendar_type_id")
    .in("id", viewIds);

  const typeIds = Array.from(new Set((views ?? []).map((v: any) => v.calendar_type_id as string)));

  const { data: calTypes } = await db
    .from("user_calendar_types")
    .select("id, sources, owner_user_id")
    .in("id", typeIds);

  if (!calTypes || calTypes.length === 0) return NextResponse.json([]);

  // 2. Build per-owner → [tenant_ids] map
  const ownerTenants: Record<string, Set<string>> = {};
  for (const ct of calTypes as any[]) {
    const ownerId = ct.owner_user_id as string;
    if (!ownerTenants[ownerId]) ownerTenants[ownerId] = new Set();
    for (const src of (ct.sources ?? []) as any[]) {
      if (src.type === "tenant" && src.tenant_id) {
        ownerTenants[ownerId].add(src.tenant_id);
      }
    }
  }

  // 3. For each owner, fetch items they're assigned to or created in those tenants
  const seen = new Set<string>();
  const allItems: any[] = [];

  await Promise.all(
    Object.entries(ownerTenants).map(async ([ownerId, tenantSet]) => {
      const tenantIds = Array.from(tenantSet);
      if (tenantIds.length === 0) return;

      // Items assigned to the owner in those tenants
      const { data: assignments } = await db
        .from("sitrep_assignments")
        .select("item_id")
        .eq("user_id", ownerId);

      const assignedIds = (assignments ?? []).map((a: any) => a.item_id as string);
      const [assignedItems, createdItems] = await Promise.all([
        fetchItemsByIds(db, assignedIds),
        db.from("sitrep_items")
          .select(SELECT)
          .eq("created_by", ownerId)
          .in("tenant_id", tenantIds)
          .limit(500),
      ]);

      // Only keep items in the shared source tenants
      for (const item of [...assignedItems.filter((i) => tenantIds.includes(i.tenant_id)), ...(createdItems.data ?? [])]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          allItems.push(item);
        }
      }
    })
  );

  return NextResponse.json(allItems);
}
