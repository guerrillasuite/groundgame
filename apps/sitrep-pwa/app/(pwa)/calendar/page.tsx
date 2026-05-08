import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import CalendarLayout from "./CalendarLayout";

export const dynamic = "force-dynamic";

const CAL_SELECT = [
  "id", "tenant_id", "squad_id", "item_type", "title",
  "status", "priority", "due_date", "start_at", "end_at", "is_all_day",
  "visibility", "created_by",
  "sitrep_assignments(user_id, role)",
].join(", ");

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function seedDefaultViews(
  userId: string,
  tenantId: string,
  squadIds: string[],
  db: ReturnType<typeof makeAdminSb>,
) {
  const { count } = await db
    .from("sitrep_views")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);

  if ((count ?? 0) > 0) return;

  await db.from("sitrep_views").insert({
    owner_user_id: userId,
    name:          "All",
    toggle_state: {
      org_ids:      tenantId ? [tenantId] : [],
      squad_ids:    squadIds,
      personal:     true,
      favorite_ids: [],
      filters:      { item_types: [], statuses: [], show_completed: true },
    },
    is_default:  true,
    sort_order:  0,
  });
}

export default async function CalendarPage() {
  const user = await getCrmUser();
  if (!user) redirect("/login");

  const sb     = makeAdminSb();
  const tenant = await getTenant(user.userId);

  const [squadsRes, userTenantsRes] = await Promise.all([
    sb
      .from("squad_members")
      .select("squad_id, role, squads(id, name, color, org_id)")
      .eq("user_id", user.userId),
    sb
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.userId)
      .in("status", ["active", "invited"]),
  ]);

  const squads = ((squadsRes.data ?? []) as any[]).map((sm) => ({
    id:       sm.squads?.id     ?? sm.squad_id,
    name:     sm.squads?.name   ?? "Unknown",
    color:    sm.squads?.color  ?? "blue",
    tenantId: sm.squads?.org_id ?? tenant?.id ?? "",
    role:     sm.role,
  }));

  const allTenantIds = [...new Set([
    ...(tenant?.id ? [tenant.id] : []),
    ...((userTenantsRes.data ?? []) as any[]).map((r) => r.tenant_id as string),
  ])];

  const tenantNamesRes = allTenantIds.length > 0
    ? await sb.from("tenants").select("id, slug, branding").in("id", allTenantIds)
    : { data: [] };
  const tenantNameMap: Record<string, string> = {};
  for (const t of (tenantNamesRes.data ?? []) as any[]) {
    tenantNameMap[t.id] = t.branding?.appName ?? t.slug ?? t.id;
  }
  const orgs: { id: string; name: string }[] = allTenantIds.map((id) => ({
    id,
    name: tenantNameMap[id] ?? id,
  }));

  await seedDefaultViews(
    user.userId,
    tenant?.id ?? "",
    squads.map((s) => s.id),
    sb,
  );

  const [itemsRes, typesRes, viewsRes] = await Promise.all([
    tenant
      ? makeServiceSb(tenant.id)
          .from("sitrep_items")
          .select(CAL_SELECT)
          .eq("tenant_id", tenant.id)
          .order("start_at", { ascending: true, nullsFirst: false })
          .order("due_date",  { ascending: true, nullsFirst: false })
          .limit(1000)
      : Promise.resolve({ data: [] as any[], error: null }),

    tenant
      ? makeServiceSb(tenant.id)
          .from("sitrep_item_types")
          .select("id, name, slug, color, sort_order")
          .eq("tenant_id", tenant.id)
          .order("sort_order")
      : Promise.resolve({ data: [] as any[], error: null }),

    sb.from("sitrep_views")
      .select("id, name, toggle_state, is_default, sort_order")
      .eq("owner_user_id", user.userId)
      .order("sort_order"),
  ]);

  return (
    <Suspense>
      <CalendarLayout
        initialItems={(itemsRes.data ?? []) as any[]}
        types={(typesRes.data ?? []) as any[]}
        userId={user.userId}
        tenantId={tenant?.id ?? ""}
        orgs={orgs}
        views={(viewsRes.data ?? []) as any[]}
        squads={squads}
      />
    </Suspense>
  );
}
