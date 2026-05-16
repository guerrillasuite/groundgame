import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import AutomationsPanel from "./AutomationsPanel";

function makeAdminSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } },
  );
}

export default async function AutomationsPage() {
  const tenant  = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeAdminSb(tenant.id);

  const [
    { data: automations },
    { data: squads },
    { data: users },
    { data: pipelines },
    { data: customItemTypes },
  ] = await Promise.all([
    sb.from("sitrep_automations").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    sb.from("squads").select("id, name, color").order("name"),
    fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
      },
    ).then((r) => r.ok ? r.json() : { users: [] }).then((d) => ({ data: d.users ?? [] })),
    sb.from("tenant_contact_types").select("key, label").eq("tenant_id", tenant.id).order("order_index"),
    sb.from("sitrep_item_types").select("slug, name").eq("tenant_id", tenant.id).order("sort_order"),
  ]);

  const userList = (users ?? []).map((u: any) => ({
    id:   u.id,
    name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? u.id,
    email: u.email ?? "",
  }));

  return (
    <AutomationsPanel
      initialAutomations={automations ?? []}
      squads={squads ?? []}
      users={userList}
      tenantId={tenant.id}
      pipelines={(pipelines ?? []) as { key: string; label: string }[]}
      customItemTypes={(customItemTypes ?? []) as { slug: string; name: string }[]}
    />
  );
}
