export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import SitRepKanban from "./SitRepKanban";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSb(tenantId: string) {
  return createClient(URL_, KEY, { global: { headers: { "X-Tenant-Id": tenantId } } });
}
function makeAdminSb() {
  return createClient(URL_, KEY);
}

export default async function KanbanPage() {
  const tenant = await getTenant();

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
    admin
      .from("sitrep_items")
      .select(
        "id, tenant_id, squad_id, item_type, title, status, priority, due_date, start_at, parent_item_id, depth, visibility, created_by, sitrep_assignments(user_id, role)"
      )
      .in("tenant_id", allTenantIds)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("start_at", { ascending: true, nullsFirst: false })
      .limit(1000),
    sb
      .from("sitrep_item_types")
      .select("id, slug, name, color, sort_order, show_in_kanban, stages, is_mission_type")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
  ]);

  // Apply visibility filter
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

  // Seed system types if missing
  const rawTypes = (typesRes.data ?? []) as any[];
  const existingSlugs = new Set(rawTypes.map((t) => t.slug));
  const SYSTEM_DEFAULTS = [
    {
      slug: "task", name: "Task", color: "blue", sort_order: 0,
      show_in_kanban: true, is_mission_type: true,
      stages: [
        { slug: "open", name: "Open", color: "blue", is_terminal: false, sort_order: 0 },
        { slug: "in_progress", name: "In Progress", color: "amber", is_terminal: false, sort_order: 1 },
        { slug: "done", name: "Done", color: "green", is_terminal: true, sort_order: 2 },
        { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true, sort_order: 3 },
      ],
    },
    {
      slug: "event", name: "Event", color: "violet", sort_order: 1,
      show_in_kanban: true, is_mission_type: false,
      stages: [
        { slug: "open", name: "Open", color: "violet", is_terminal: false, sort_order: 0 },
        { slug: "confirmed", name: "Confirmed", color: "blue", is_terminal: false, sort_order: 1 },
        { slug: "done", name: "Done", color: "green", is_terminal: true, sort_order: 2 },
        { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true, sort_order: 3 },
      ],
    },
    {
      slug: "meeting", name: "Meeting", color: "teal", sort_order: 2,
      show_in_kanban: true, is_mission_type: false,
      stages: [
        { slug: "open", name: "Open", color: "teal", is_terminal: false, sort_order: 0 },
        { slug: "confirmed", name: "Confirmed", color: "blue", is_terminal: false, sort_order: 1 },
        { slug: "done", name: "Done", color: "green", is_terminal: true, sort_order: 2 },
        { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true, sort_order: 3 },
      ],
    },
  ];
  const types = [
    ...SYSTEM_DEFAULTS.filter((t) => !existingSlugs.has(t.slug)),
    ...rawTypes,
  ].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Suspense>
      <SitRepKanban
        initialItems={items}
        types={types}
        currentUserId={crmUser.userId}
      />
    </Suspense>
  );
}
