// app/crm/sitrep/[id]/page.tsx
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import SitRepItemClient from "./SitRepItemClient";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Ctx = { params: Promise<{ id: string }> };

export default async function SitRepItemPage({ params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeSb(tenant.id);

  const [itemRes, missionsRes] = await Promise.all([
    sb
      .from("sitrep_items")
      .select("*, sitrep_assignments(user_id, role), sitrep_links(id, record_type, record_id, display_label)")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .single(),
    sb
      .from("sitrep_missions")
      .select("id, title, status")
      .eq("tenant_id", tenant.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  if (!itemRes.data) redirect("/crm/sitrep");

  const item = itemRes.data as any;

  // Visibility check
  if (item.visibility === "private" && item.created_by !== crmUser.userId) redirect("/crm/sitrep");
  if (item.visibility === "assignee_only") {
    const isAssigned = item.sitrep_assignments?.some((a: any) => a.user_id === crmUser.userId);
    if (!isAssigned && item.created_by !== crmUser.userId) redirect("/crm/sitrep");
  }

  // Fetch users for assignee display/picker
  let users: { id: string; name: string; email: string }[] = [];
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (serviceKey && supabaseUrl) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      });
      if (res.ok) {
        const json = await res.json();
        users = (json.users ?? []).map((u: any) => ({
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
      missions={(missionsRes.data ?? []) as any[]}
      users={users}
      currentUserId={crmUser.userId}
    />
  );
}
