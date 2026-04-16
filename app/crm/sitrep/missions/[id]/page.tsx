// app/crm/sitrep/missions/[id]/page.tsx
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import MissionDetailClient from "./MissionDetailClient";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Ctx = { params: Promise<{ id: string }> };

export default async function MissionDetailPage({ params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeSb(tenant.id);

  const [missionRes, itemsRes] = await Promise.all([
    sb
      .from("sitrep_missions")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .single(),
    sb
      .from("sitrep_items")
      .select("id, item_type, title, status, priority, due_date, start_at, end_at, is_all_day, visibility, created_by, sitrep_assignments(user_id, role)")
      .eq("mission_id", id)
      .eq("tenant_id", tenant.id)
      .order("due_date",  { ascending: true, nullsFirst: false })
      .order("start_at",  { ascending: true, nullsFirst: false }),
  ]);

  if (!missionRes.data) redirect("/crm/sitrep/missions");
  const mission = missionRes.data as any;

  // Visibility check
  if (mission.visibility === "private" && mission.created_by !== crmUser.userId) {
    redirect("/crm/sitrep/missions");
  }

  // Calculate progress
  const allItems  = (itemsRes.data ?? []) as any[];
  const tasks     = allItems.filter((i) => i.item_type === "task");
  const doneTasks = tasks.filter((i) => i.status === "done").length;
  const progress  = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

  // Fetch users
  let users: { id: string; name: string; email: string }[] = [];
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    } catch { /* best-effort */ }
  }

  return (
    <MissionDetailClient
      mission={mission}
      items={allItems}
      progress={progress}
      users={users}
      currentUserId={crmUser.userId}
    />
  );
}
