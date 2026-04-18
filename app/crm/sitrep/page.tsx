// app/crm/sitrep/page.tsx
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import SitRepPanel from "./SitRepPanel";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function SitRepPage() {
  const tenant = await getTenant();
  if (!hasFeature(tenant.features, "sitrep_core")) redirect("/crm");

  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeSb(tenant.id);

  const [itemsRes, typesRes, missionsRes] = await Promise.all([
    sb
      .from("sitrep_items")
      .select(
        "id, item_type, title, description, location, status, priority, due_date, start_at, end_at, is_all_day, mission_id, visibility, created_by, created_at, sitrep_assignments(user_id, role)"
      )
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("start_at", { ascending: true, nullsFirst: false })
      .limit(500),
    sb
      .from("sitrep_item_types")
      .select("slug, color")
      .eq("tenant_id", tenant.id),
    sb
      .from("sitrep_missions")
      .select("id, title, status")
      .eq("tenant_id", tenant.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
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

  // Apply visibility filter server-side
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

  const missions = (missionsRes.data ?? []) as any[];

  const typeColors: Record<string, string> = {};
  for (const t of (typesRes.data ?? []) as any[]) {
    if (t.slug && t.color) typeColors[t.slug] = t.color;
  }

  return (
    <SitRepPanel
      initialItems={items}
      missions={missions}
      users={users}
      currentUserId={crmUser.userId}
      hasMissions={hasFeature(tenant.features, "sitrep_missions")}
      typeColors={typeColors}
    />
  );
}
