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

async function seedCalendarTypes(userId: string, tenantId: string) {
  const db = sbRaw();

  const { count } = await db
    .from("user_calendar_types")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);

  if ((count ?? 0) > 0) return; // already seeded

  // Create Work type
  const { data: workType } = await db
    .from("user_calendar_types")
    .insert({
      owner_user_id: userId,
      name:          "Work",
      color:         "blue",
      cal_type:      "work",
      sources:       [{ type: "tenant", tenant_id: tenantId }],
      sort_order:    0,
    })
    .select("id")
    .single();

  if (workType) {
    await db.from("user_calendar_views").insert({
      calendar_type_id: workType.id,
      owner_user_id:    userId,
      name:             "My Work",
      filter_config:    { assignee_filter: "me" },
      is_default:       true,
      sort_order:       0,
    });
  }

  // Create Personal type
  const { data: personalType } = await db
    .from("user_calendar_types")
    .insert({
      owner_user_id: userId,
      name:          "Personal",
      color:         "violet",
      cal_type:      "personal",
      sources:       [{ type: "personal" }],
      sort_order:    1,
    })
    .select("id")
    .single();

  if (personalType) {
    await db.from("user_calendar_views").insert({
      calendar_type_id: personalType.id,
      owner_user_id:    userId,
      name:             "Private",
      filter_config:    {},
      is_default:       true,
      sort_order:       0,
    });
  }
}

export default async function SitRepCalendarPage() {
  const tenant  = await getTenant();
  if (!hasFeature(tenant.features, "sitrep_core")) redirect("/crm");

  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeSb(tenant.id);

  // Seed calendar types if first time
  await seedCalendarTypes(crmUser.userId, tenant.id);

  const [itemsRes, typesRes, calTypesRes, sharedViewsRes] = await Promise.all([
    sb
      .from("sitrep_items")
      .select(
        "id, item_type, title, description, location, location_address, status, priority, due_date, start_at, end_at, is_all_day, mission_id, parent_item_id, depth, visibility, created_by, created_at, sitrep_assignments(user_id, role)"
      )
      .eq("tenant_id", tenant.id)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000),
    sb
      .from("sitrep_item_types")
      .select("slug, color")
      .eq("tenant_id", tenant.id),
    sbRaw()
      .from("user_calendar_types")
      .select("id, name, color, cal_type, sources, delegate_for, sort_order, user_calendar_views(id, name, color, filter_config, is_default, sort_order)")
      .eq("owner_user_id", crmUser.userId)
      .order("sort_order"),
    sbRaw()
      .from("calendar_view_shares")
      .select("id, role, view_id, user_calendar_views(id, name, color, filter_config, user_calendar_types(id, name, color, owner_user_id))")
      .eq("shared_with_user_id", crmUser.userId),
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

  const allItems = (itemsRes.data ?? []) as any[];
  const items = allItems.filter((item) => {
    if (item.visibility === "private") return item.created_by === crmUser.userId;
    if (item.visibility === "assignee_only") {
      return (
        item.created_by === crmUser.userId ||
        item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId)
      );
    }
    return true;
  });

  const typeColors: Record<string, string> = {};
  for (const t of (typesRes.data ?? []) as any[]) {
    if (t.slug && t.color) typeColors[t.slug] = t.color;
  }

  const calendarTypes = (calTypesRes.data ?? []) as any[];

  const sharedViews = ((sharedViewsRes.data ?? []) as any[]).map((s) => {
    const view    = s.user_calendar_views ?? {};
    const calType = view.user_calendar_types ?? {};
    return {
      share_id:   s.id,
      role:       s.role,
      view_id:    s.view_id,
      view_name:  view.name      ?? "Unknown",
      view_color: view.color     ?? null,
      type_name:  calType.name   ?? "Unknown",
      type_color: calType.color  ?? "blue",
      owner_name: calType.owner_user_id ?? "Someone",
    };
  });

  return (
    <Suspense>
      <CalendarLayout
        initialItems={items}
        missions={[]}
        users={users}
        currentUserId={crmUser.userId}
        hasMissions={hasFeature(tenant.features, "sitrep_missions")}
        typeColors={typeColors}
        calendarTypes={calendarTypes}
        tenantId={tenant.id}
        sharedViews={sharedViews}
      />
    </Suspense>
  );
}
