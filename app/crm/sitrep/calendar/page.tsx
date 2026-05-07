// app/crm/sitrep/calendar/page.tsx
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import CalendarLayout from "./CalendarLayout";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSb(tenantId: string) {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { "X-Tenant-Id": tenantId } },
  });
}
const sbRaw = () => createClient(SUPABASE_URL, SERVICE_KEY);

const ITEM_SELECT = [
  "id", "item_type", "title", "description",
  "location", "location_address", "status", "priority",
  "due_date", "start_at", "end_at", "is_all_day",
  "mission_id", "parent_item_id", "depth",
  "visibility", "created_by", "created_at",
  "tenant_id", "squad_id",
  "sitrep_assignments(user_id, role)",
].join(", ");

async function seedDefaultViews(
  userId: string,
  tenantId: string,
  squadIds: string[],
  db: ReturnType<typeof sbRaw>,
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
      org_ids:      [tenantId],
      squad_ids:    squadIds,
      personal:     true,
      favorite_ids: [],
      filters:      { item_types: [], statuses: [], show_completed: true },
    },
    is_default:  true,
    sort_order:  0,
  });
}

export default async function SitRepCalendarPage() {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb   = makeSb(tenant.id);
  const sbRw = sbRaw();

  // Fetch squads first so we can include squad IDs in the default view seed
  const squadsRes = await sbRw
    .from("squad_members")
    .select("squad_id, role, squads(id, name, color, tenant_id)")
    .eq("user_id", crmUser.userId);

  const squads = ((squadsRes.data ?? []) as any[]).map((sm) => ({
    id:       sm.squads?.id       ?? sm.squad_id,
    name:     sm.squads?.name     ?? "Unknown",
    color:    sm.squads?.color    ?? "blue",
    tenantId: sm.squads?.tenant_id ?? tenant.id,
    role:     sm.role,
  }));

  await seedDefaultViews(
    crmUser.userId,
    tenant.id,
    squads.map((s) => s.id),
    sbRw,
  );

  const [itemsRes, typesRes, viewsRes] = await Promise.all([
    sb
      .from("sitrep_items")
      .select(ITEM_SELECT)
      .eq("tenant_id", tenant.id)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("due_date",  { ascending: true, nullsFirst: false })
      .limit(1000),
    sb
      .from("sitrep_item_types")
      .select("slug, color")
      .eq("tenant_id", tenant.id),
    sbRw
      .from("sitrep_views")
      .select("id, name, toggle_state, is_default, sort_order")
      .eq("owner_user_id", crmUser.userId)
      .order("sort_order"),
  ]);

  let users: { id: string; name: string; email: string }[] = [];
  try {
    const [authRes, membersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      }),
      sb.from("user_tenants").select("user_id").eq("tenant_id", tenant.id).in("status", ["active", "invited"]),
    ]);
    if (authRes.ok) {
      const json = await authRes.json();
      const tenantUserIds = new Set((membersRes.data ?? []).map((m: any) => m.user_id));
      users = (json.users ?? [])
        .filter((u: any) => tenantUserIds.has(u.id))
        .map((u: any) => ({
          id:    u.id,
          email: u.email ?? "",
          name:  u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? "",
        }));
    }
  } catch { /* best-effort */ }

  const typeColors: Record<string, string> = {};
  for (const t of (typesRes.data ?? []) as any[]) {
    if (t.slug && t.color) typeColors[t.slug] = t.color;
  }

  return (
    <Suspense>
      <CalendarLayout
        initialItems={(itemsRes.data ?? []) as any[]}
        missions={[]}
        users={users}
        currentUserId={crmUser.userId}
        hasMissions={hasFeature(tenant.features, "sitrep_missions")}
        typeColors={typeColors}
        tenantId={tenant.id}
        views={(viewsRes.data ?? []) as any[]}
        squads={squads}
      />
    </Suspense>
  );
}
