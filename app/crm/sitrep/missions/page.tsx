// app/crm/sitrep/missions/page.tsx
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import MissionsPanel from "./MissionsPanel";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function MissionsPage() {
  const tenant = await getTenant();
  if (!hasFeature(tenant.features, "sitrep_missions")) redirect("/crm/sitrep");

  const crmUser = await getCrmUser();
  if (!crmUser) redirect("/crm/login");

  const sb = makeSb(tenant.id);

  const [missionsRes, itemsRes] = await Promise.all([
    sb
      .from("sitrep_missions")
      .select("id, title, description, status, due_date, visibility, created_by, created_at")
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    sb
      .from("sitrep_items")
      .select("id, item_type, status, mission_id")
      .eq("tenant_id", tenant.id)
      .not("mission_id", "is", null),
  ]);

  const allMissions = (missionsRes.data ?? []) as any[];
  const allItems    = (itemsRes.data ?? []) as any[];

  // Apply visibility filter
  const missions = allMissions.filter((m) => {
    if (m.visibility === "private") return m.created_by === crmUser.userId;
    return true;
  });

  // Build per-mission item stats
  type MissionStats = { tasks: number; events: number; meetings: number; doneTasks: number };
  const statsMap = new Map<string, MissionStats>();
  for (const item of allItems) {
    if (!item.mission_id) continue;
    const s = statsMap.get(item.mission_id) ?? { tasks: 0, events: 0, meetings: 0, doneTasks: 0 };
    if (item.item_type === "task")    { s.tasks++; if (item.status === "done") s.doneTasks++; }
    if (item.item_type === "event")   s.events++;
    if (item.item_type === "meeting") s.meetings++;
    statsMap.set(item.mission_id, s);
  }

  const missionsWithStats = missions.map((m) => ({
    ...m,
    stats: statsMap.get(m.id) ?? { tasks: 0, events: 0, meetings: 0, doneTasks: 0 },
  }));

  return (
    <Suspense>
      <MissionsPanel
        initialMissions={missionsWithStats}
        currentUserId={crmUser.userId}
      />
    </Suspense>
  );
}
