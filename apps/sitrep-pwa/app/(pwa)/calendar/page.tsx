import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import CalendarLayout from "./CalendarLayout";

export const dynamic = "force-dynamic";

const CAL_SELECT = "id, tenant_id, item_type, title, status, priority, due_date, start_at, end_at, is_all_day, visibility, created_by, sitrep_assignments(user_id, role)";

function makeRawSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function CalendarPage() {
  const user = await getCrmUser();
  if (!user) redirect("/login");

  const sb = makeRawSb();

  // All tenants this user belongs to
  const { data: memberships } = await sb
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", user.userId)
    .in("status", ["active", "invited"]);

  const tenantIds = (memberships ?? []).map((m: any) => m.tenant_id as string);

  // Primary tenant (for creating new items + fetching types)
  const primaryTenantId = tenantIds[0] ?? null;
  if (!primaryTenantId) redirect("/login");

  // All item IDs this user is assigned to
  const { data: assignments } = await sb
    .from("sitrep_assignments")
    .select("item_id")
    .eq("user_id", user.userId);

  const assignedIds = [...new Set((assignments ?? []).map((a: any) => a.item_id as string))];

  // Fetch items across all tenants: created by me OR assigned to me
  const [createdRes, assignedRes, typesRes] = await Promise.all([
    sb.from("sitrep_items")
      .select(CAL_SELECT)
      .in("tenant_id", tenantIds)
      .eq("created_by", user.userId)
      .order("start_at", { ascending: true, nullsFirst: false })
      .limit(1000),

    assignedIds.length > 0
      ? sb.from("sitrep_items")
          .select(CAL_SELECT)
          .in("tenant_id", tenantIds)
          .in("id", assignedIds.slice(0, 500))
          .order("start_at", { ascending: true, nullsFirst: false })
          .limit(1000)
      : Promise.resolve({ data: [] as any[], error: null }),

    makeServiceSb(primaryTenantId)
      .from("sitrep_item_types")
      .select("id, name, slug, color, sort_order")
      .eq("tenant_id", primaryTenantId)
      .order("sort_order"),
  ]);

  // Merge and dedup
  const seen = new Set<string>();
  const allItems: any[] = [];
  for (const item of [...(createdRes.data ?? []), ...(assignedRes.data ?? [])]) {
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
        tenantId={primaryTenantId}
      />
    </Suspense>
  );
}
