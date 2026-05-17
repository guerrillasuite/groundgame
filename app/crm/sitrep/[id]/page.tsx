// app/crm/sitrep/[id]/page.tsx
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import SitRepItemClient from "./SitRepItemClient";
import { getFieldOverrides, overrideMap, hiddenMap } from "@/lib/crm/standard-field-overrides";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSb(tenantId: string) {
  return createClient(URL_, KEY, { global: { headers: { "X-Tenant-Id": tenantId } } });
}
function makeAdminSb() {
  return createClient(URL_, KEY);
}

type Ctx = { params: Promise<{ id: string }> };

export default async function SitRepItemPage({ params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const admin = makeAdminSb();

  // Resolve all tenants this user belongs to (for cross-tenant item access)
  const userTenantsRes = await admin
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", crmUser.userId)
    .in("status", ["active", "invited"]);
  const allTenantIds = [...new Set([
    tenant.id,
    ...((userTenantsRes.data ?? []) as any[]).map((r) => r.tenant_id as string),
  ])];

  // Look up item without tenant restriction — admin client bypasses RLS
  const itemRes = await admin
    .from("sitrep_items")
    .select("*, sitrep_assignments(user_id, role), sitrep_links(id, record_type, record_id, display_label)")
    .eq("id", id)
    .single();

  if (!itemRes.data) redirect("/crm/sitrep");

  // Verify this item belongs to one of the user's tenants
  const itemTenantId = (itemRes.data as any).tenant_id;
  if (itemTenantId && !allTenantIds.includes(itemTenantId)) redirect("/crm/sitrep");

  // Use tenant-scoped sb for types (use item's actual tenant if different)
  const effectiveTenantId = itemTenantId ?? tenant.id;
  const sb = makeSb(effectiveTenantId);

  const typesRes = await sb
    .from("sitrep_item_types")
    .select("id, slug, name, color, stages, is_mission_type, show_in_kanban, booking_enabled")
    .eq("tenant_id", effectiveTenantId);

  const item = itemRes.data as any;

  // Visibility check
  if (item.visibility === "private" && item.created_by !== crmUser.userId) redirect("/crm/sitrep");
  if (item.visibility === "assignee_only") {
    const isAssigned = item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId);
    if (!isAssigned && item.created_by !== crmUser.userId) redirect("/crm/sitrep");
  }

  // Build type map
  const rawTypes = (typesRes.data ?? []) as any[];
  const SYSTEM_TYPE_DEFAULTS: any[] = [
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

  const existingSlugs = new Set(rawTypes.map((t: any) => t.slug));
  const allTypes = [
    ...SYSTEM_TYPE_DEFAULTS.filter((t) => !existingSlugs.has(t.slug)),
    ...rawTypes,
  ];

  const typeDefs: Record<string, any> = {};
  for (const t of allTypes) {
    typeDefs[t.slug] = t;
  }

  const sitrepTypeId: string | null = typeDefs[item.item_type]?.id ?? null;

  // Fetch parent item title if item has a parent
  let parentItem: { id: string; title: string; item_type: string } | null = null;
  if (item.parent_item_id) {
    const { data: parentData } = await sb
      .from("sitrep_items")
      .select("id, title, item_type")
      .eq("id", item.parent_item_id)
      .eq("tenant_id", tenant.id)
      .single();
    if (parentData) parentItem = parentData as any;
  }

  // Fetch field label overrides for this sitrep type
  const fieldOverrides  = await getFieldOverrides(effectiveTenantId, "sitrep_items", sitrepTypeId ?? "");
  const fieldLabels     = Object.fromEntries(overrideMap(fieldOverrides));
  const hiddenFields    = hiddenMap(fieldOverrides);

  // Fetch tenant users
  let users: { id: string; name: string; email: string }[] = [];
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (serviceKey && supabaseUrl) {
    try {
      const [authRes, membersRes] = await Promise.all([
        fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
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
      // best-effort
    }
  }

  return (
    <SitRepItemClient
      item={item}
      typeDefs={typeDefs}
      parentItem={parentItem}
      users={users}
      currentUserId={crmUser.userId}
      sitrepTypeId={sitrepTypeId}
      fieldLabels={fieldLabels}
      hiddenFields={hiddenFields}
    />
  );
}
