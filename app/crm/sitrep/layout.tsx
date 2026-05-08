// app/crm/sitrep/layout.tsx  — server component
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import type { SitRepView } from "@/lib/sitrep-calendar-filter";
import SitRepShell from "./_components/SitRepShell";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sbRaw() { return createClient(URL_, KEY); }
function sbTenant(tenantId: string) {
  return createClient(URL_, KEY, { global: { headers: { "X-Tenant-Id": tenantId } } });
}

async function seedDefaultViews(userId: string, tenantId: string, squadIds: string[]) {
  const db = sbRaw();
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
    is_default: true,
    sort_order: 0,
  });
}

const SYSTEM_TYPES = [
  { slug: "task",    name: "Task",    color: "blue"   },
  { slug: "event",   name: "Event",   color: "violet" },
  { slug: "meeting", name: "Meeting", color: "teal"   },
];

export default async function SitRepLayout({ children }: { children: React.ReactNode }) {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const db = sbRaw();
  const sb = sbTenant(tenant.id);

  const [squadsRes, typesRes, userTenantsRes] = await Promise.all([
    db.from("squad_members")
      .select("squad_id, role, squads(id, name, color, org_id)")
      .eq("user_id", crmUser.userId),
    sb.from("sitrep_item_types")
      .select("slug, name, color")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
    db.from("user_tenants")
      .select("tenant_id")
      .eq("user_id", crmUser.userId)
      .in("status", ["active", "invited"]),
  ]);

  const squads = ((squadsRes.data ?? []) as any[]).map((sm) => ({
    id:       sm.squads?.id     ?? sm.squad_id,
    name:     sm.squads?.name   ?? "Unknown",
    color:    sm.squads?.color  ?? "blue",
    tenantId: sm.squads?.org_id ?? tenant.id,
    role:     sm.role,
  }));

  const allTenantIds = [...new Set([
    tenant.id,
    ...((userTenantsRes.data ?? []) as any[]).map((r) => r.tenant_id as string),
  ])];

  // Fetch names for all tenants (separate query avoids PostgREST join FK dependency)
  const tenantNamesRes = await db
    .from("tenants")
    .select("id, slug, branding")
    .in("id", allTenantIds);

  const tenantNameMap: Record<string, string> = {};
  for (const t of (tenantNamesRes.data ?? []) as any[]) {
    tenantNameMap[t.id] = t.branding?.appName ?? t.slug ?? t.id;
  }

  const orgs: { id: string; name: string }[] = allTenantIds.map((id) => ({
    id,
    name: tenantNameMap[id] ?? (id === tenant.id ? (tenant.branding?.appName ?? tenant.slug) : id),
  }));

  await seedDefaultViews(crmUser.userId, tenant.id, squads.map((s) => s.id));

  const viewsRes = await db
    .from("sitrep_views")
    .select("id, name, toggle_state, is_default, sort_order")
    .eq("owner_user_id", crmUser.userId)
    .order("sort_order");

  const views: SitRepView[] = (viewsRes.data ?? []) as SitRepView[];

  const rawTypes = (typesRes.data ?? []) as any[];
  const existingSlugs = new Set(rawTypes.map((t: any) => t.slug));
  const allTypes = [
    ...SYSTEM_TYPES.filter((t) => !existingSlugs.has(t.slug)),
    ...rawTypes,
  ];

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "rgb(10 13 20)" }} />}>
      <SitRepShell
        initialViews={views}
        squads={squads}
        orgs={orgs}
        currentUserId={crmUser.userId}
        allTypes={allTypes}
      >
        {children}
      </SitRepShell>
    </Suspense>
  );
}
