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
function makeAdminSb() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

const ITEM_SELECT = [
  "id", "item_type", "title", "description",
  "location_id", "meeting_url",
  "location:locations(place_name, full_address, address_line1, city, state)",
  "status", "priority",
  "due_date", "start_at", "end_at", "is_all_day",
  "mission_id", "parent_item_id", "depth",
  "visibility", "created_by", "created_at",
  "tenant_id", "squad_id",
  "sitrep_assignments(user_id, role)",
].join(", ");

export default async function SitRepCalendarPage() {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb    = makeSb(tenant.id);
  const admin = makeAdminSb();

  const userTenantsRes = await admin
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", crmUser.userId)
    .in("status", ["active", "invited"]);
  const allTenantIds = [...new Set([
    tenant.id,
    ...((userTenantsRes.data ?? []) as any[]).map((r) => r.tenant_id as string),
  ])];

  const [itemsRes, typesRes] = await Promise.all([
    admin.from("sitrep_items")
      .select(ITEM_SELECT)
      .in("tenant_id", allTenantIds)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("due_date",  { ascending: true, nullsFirst: false })
      .limit(1000),
    sb.from("sitrep_item_types")
      .select("slug, color")
      .eq("tenant_id", tenant.id),
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

  const calendarItems = ((itemsRes.data ?? []) as any[]).map((item) => {
    const loc = item.location;
    const location_display = loc
      ? ((loc.place_name ?? loc.address_line1 ?? loc.full_address ?? "") +
         (loc.city ? `, ${loc.city}` : "") +
         (loc.state ? `, ${loc.state}` : "")).trim() || null
      : null;
    return { ...item, location_display, location: undefined };
  });

  return (
    <Suspense>
      <CalendarLayout
        initialItems={calendarItems}
        missions={[]}
        users={users}
        currentUserId={crmUser.userId}
        hasMissions={hasFeature(tenant.features, "sitrep_missions")}
        typeColors={typeColors}
      />
    </Suspense>
  );
}
