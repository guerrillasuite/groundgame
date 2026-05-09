import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import ListPanel from "./ListPanel";

export const dynamic = "force-dynamic";

function sbAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function ListPage() {
  const user = await getCrmUser();
  if (!user) redirect("/login");

  const tenant = await getTenant(user.userId);
  const admin  = sbAdmin();

  let initialTypes: any[] = [];
  let orgs: { id: string; name: string }[] = [];

  if (tenant) {
    const sb = makeServiceSb(tenant.id);
    const [typesRes, userTenantsRes] = await Promise.all([
      sb.from("sitrep_item_types").select("id, name, slug, color, sort_order").eq("tenant_id", tenant.id).order("sort_order"),
      admin.from("user_tenants").select("tenant_id").eq("user_id", user.userId).in("status", ["active", "invited"]),
    ]);
    initialTypes = typesRes.data ?? [];

    const allTenantIds = [...new Set([
      tenant.id,
      ...((userTenantsRes.data ?? []) as any[]).map((r) => r.tenant_id as string),
    ])];
    const tenantNamesRes = await admin.from("tenants").select("id, slug, branding").in("id", allTenantIds);
    const tenantNameMap: Record<string, string> = {};
    for (const t of (tenantNamesRes.data ?? []) as any[]) {
      tenantNameMap[t.id] = t.branding?.appName ?? t.slug ?? t.id;
    }
    orgs = allTenantIds.map((id) => ({ id, name: tenantNameMap[id] ?? id }));
  }

  return (
    <ListPanel
      userId={user.userId}
      tenantId={tenant?.id ?? ""}
      initialTypes={initialTypes}
      initialOrgs={orgs}
    />
  );
}
