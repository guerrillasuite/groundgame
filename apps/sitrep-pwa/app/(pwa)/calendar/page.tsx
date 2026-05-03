import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import CalendarLayout from "./CalendarLayout";

export const dynamic = "force-dynamic";

const CAL_SELECT = "id, tenant_id, item_type, title, status, priority, due_date, start_at, end_at, is_all_day, visibility, created_by, sitrep_assignments(user_id, role)";

// Service role, no tenant header — bypasses ALL RLS
function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function fetchCalItemsByIds(sb: ReturnType<typeof makeAdminSb>, ids: string[]): Promise<any[]> {
  const CHUNK = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) => sb.from("sitrep_items").select(CAL_SELECT).in("id", chunk).limit(CHUNK))
  );
  return results.flatMap((r) => r.data ?? []);
}

export default async function CalendarPage() {
  const user = await getCrmUser();
  if (!user) redirect("/login");

  const sb = makeAdminSb();

  // Get primary tenant only for fetching types + creating new items
  const tenant = await getTenant(user.userId);

  // All item IDs this user is assigned to across ALL tenants (no tenant filter)
  const { data: assignments } = await sb
    .from("sitrep_assignments")
    .select("item_id")
    .eq("user_id", user.userId);

  const assignedIds = [...new Set((assignments ?? []).map((a: any) => a.item_id as string))];

  const [assignedItems, createdRes, typesRes] = await Promise.all([
    // All items assigned to this user — no tenant scope
    fetchCalItemsByIds(sb, assignedIds),

    // All items created by this user — no tenant scope
    sb.from("sitrep_items")
      .select(CAL_SELECT)
      .eq("created_by", user.userId)
      .limit(500),

    // Types from primary tenant (for display only)
    tenant
      ? makeServiceSb(tenant.id)
          .from("sitrep_item_types")
          .select("id, name, slug, color, sort_order")
          .eq("tenant_id", tenant.id)
          .order("sort_order")
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  // Merge and dedup
  const seen = new Set<string>();
  const allItems: any[] = [];
  for (const item of [...assignedItems, ...(createdRes.data ?? [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      allItems.push(item);
    }
  }

  return (
    <Suspense>
      <CalendarLayout
        initialItems={allItems}
        types={typesRes.data ?? []}
        userId={user.userId}
        tenantId={tenant?.id ?? ""}
      />
    </Suspense>
  );
}
