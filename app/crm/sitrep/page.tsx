// app/crm/sitrep/page.tsx
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import SitRepPanel from "./SitRepPanel";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSb(tenantId: string) {
  return createClient(URL_, KEY, { global: { headers: { "X-Tenant-Id": tenantId } } });
}
function makeAdminSb() {
  return createClient(URL_, KEY);
}

export default async function SitRepPage() {
  const tenant = await getTenant();

  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb    = makeSb(tenant.id);
  const admin = makeAdminSb();

  // Resolve all tenant IDs this user belongs to
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
    admin
      .from("sitrep_items")
      .select(
        "id, tenant_id, squad_id, item_type, title, description, location_id, meeting_url, location:locations(place_name, full_address, address_line1, city, state), status, priority, due_date, start_at, end_at, is_all_day, mission_id, parent_item_id, depth, visibility, created_by, created_at, sitrep_assignments(user_id, role)"
      )
      .in("tenant_id", allTenantIds)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("start_at", { ascending: true, nullsFirst: false })
      .limit(1000),
    sb
      .from("sitrep_item_types")
      .select("slug, color, name, stages, is_mission_type, show_in_kanban, booking_enabled")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
  ]);

  // Fetch CRM users scoped to this tenant
  let users: { id: string; name: string; email: string }[] = [];
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (serviceKey && supabaseUrl) {
    try {
      const [authRes, membersRes] = await Promise.all([
        fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        }),
        sb.from("user_tenants").select("user_id").eq("tenant_id", tenant.id).in("status", ["active", "invited"]),
      ]);
      if (authRes.ok) {
        const json = await authRes.json();
        const tenantUserIds = new Set((membersRes.data ?? []).map((m: any) => m.user_id));
        users = (json.users ?? [])
          .filter((u: any) => tenantUserIds.has(u.id))
          .map((u: any) => ({
            id: u.id,
            email: u.email ?? "",
            name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? "",
          }));
      }
    } catch {
      // ok — users list is best-effort for name display
    }
  }

  // Apply visibility filter server-side, derive location_display
  const allItems = ((itemsRes.data ?? []) as any[]).map((item) => {
    const loc = item.location;
    const location_display = loc
      ? ((loc.place_name ?? loc.address_line1 ?? loc.full_address ?? "") +
         (loc.city ? `, ${loc.city}` : "") +
         (loc.state ? `, ${loc.state}` : "")).trim() || null
      : null;
    return { ...item, location_display, location: undefined };
  });
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

  const rawTypes = (typesRes.data ?? []) as any[];

  // Seed system type defaults if missing from DB
  const existingSlugs = new Set(rawTypes.map((t: any) => t.slug));
  const SYSTEM_DEFAULTS: any[] = [
    {
      slug: "task", name: "Task", color: "blue", is_mission_type: true,
      stages: [
        { slug: "open", name: "Open", color: "blue", is_terminal: false, sort_order: 0 },
        { slug: "in_progress", name: "In Progress", color: "amber", is_terminal: false, sort_order: 1 },
        { slug: "done", name: "Done", color: "green", is_terminal: true, sort_order: 2 },
        { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true, sort_order: 3 },
      ],
    },
    {
      slug: "event", name: "Event", color: "violet", is_mission_type: false,
      stages: [
        { slug: "open", name: "Open", color: "violet", is_terminal: false, sort_order: 0 },
        { slug: "confirmed", name: "Confirmed", color: "blue", is_terminal: false, sort_order: 1 },
        { slug: "done", name: "Done", color: "green", is_terminal: true, sort_order: 2 },
        { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true, sort_order: 3 },
      ],
    },
    {
      slug: "meeting", name: "Meeting", color: "teal", is_mission_type: false,
      stages: [
        { slug: "open", name: "Open", color: "teal", is_terminal: false, sort_order: 0 },
        { slug: "confirmed", name: "Confirmed", color: "blue", is_terminal: false, sort_order: 1 },
        { slug: "done", name: "Done", color: "green", is_terminal: true, sort_order: 2 },
        { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true, sort_order: 3 },
      ],
    },
  ];

  const allTypes = [
    ...SYSTEM_DEFAULTS.filter((t) => !existingSlugs.has(t.slug)),
    ...rawTypes,
  ];

  const typeColors: Record<string, string> = {};
  const typeNames:  Record<string, string> = {};
  const typeDefs:   Record<string, any>    = {};
  for (const t of allTypes) {
    if (t.slug && t.color) typeColors[t.slug] = t.color;
    if (t.slug && t.name)  typeNames[t.slug]  = t.name;
    typeDefs[t.slug] = t;
  }

  return (
    <Suspense>
      <SitRepPanel
        initialItems={items}
        users={users}
        currentUserId={crmUser.userId}
        hasMissions={hasFeature(tenant.features, "sitrep_missions")}
        typeColors={typeColors}
        typeNames={typeNames}
        typeDefs={typeDefs}
      />
    </Suspense>
  );
}
