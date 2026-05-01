export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import SitRepTimeline from "./SitRepTimeline";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function SitRepTimelinePage() {
  const tenant = await getTenant();
  if (!hasFeature(tenant.features, "sitrep_core")) redirect("/crm");

  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeSb(tenant.id);

  const [itemsRes, typesRes] = await Promise.all([
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
      .select("slug, color, name, is_mission_type, stages")
      .eq("tenant_id", tenant.id),
  ]);

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
    } catch { /* best-effort */ }
  }

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
  const typeDefs: Record<string, any> = {};
  for (const t of (typesRes.data ?? []) as any[]) {
    if (t.slug && t.color) typeColors[t.slug] = t.color;
    if (t.slug) typeDefs[t.slug] = { name: t.name, color: t.color, is_mission_type: t.is_mission_type, stages: t.stages ?? [] };
  }

  return (
    <Suspense>
      <SitRepTimeline
        initialItems={items}
        missions={[]}
        users={users}
        currentUserId={crmUser.userId}
        hasMissions={hasFeature(tenant.features, "sitrep_missions")}
        typeColors={typeColors}
        typeDefs={typeDefs}
      />
    </Suspense>
  );
}
