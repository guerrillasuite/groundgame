import Link from "next/link";
import { S, card, makeSb, fmtCurrency, DEFAULT_ADMIN_KPIS, startOfTodayUTC } from "./_helpers";

const KPI_META: Record<string, { label: string; href: string; color: string }> = {
  stops_today:            { label: "Stops Today",        href: "/crm/stops",         color: "#6366f1" },
  stops_this_week:        { label: "Stops This Week",    href: "/crm/stops",         color: "#8b5cf6" },
  open_opps:              { label: "Open Opportunities", href: "/crm/opportunities", color: "#f59e0b" },
  pipeline_value:         { label: "Pipeline Value",     href: "/crm/opportunities", color: "#f59e0b" },
  win_rate:               { label: "Win Rate (30d)",     href: "/crm/opportunities", color: "#22c55e" },
  contacts_reached_week:  { label: "Contacts Reached",  href: "/crm/people",        color: "#06b6d4" },
  active_lists:           { label: "Active Lists",       href: "/crm/lists",         color: "#10b981" },
  past_due_sitrep:        { label: "Past Due Items",     href: "/crm/sitrep",        color: "#ef4444" },
  surveys_completed_week: { label: "Surveys This Week",  href: "/crm/survey",        color: "#8b5cf6" },
  new_people_week:        { label: "New Contacts",       href: "/crm/people",        color: "#3b82f6" },
};

export { DEFAULT_ADMIN_KPIS };

export async function KpiRow({ tenantId, kpiIds, timezone }: { tenantId: string; kpiIds: string[]; timezone?: string }) {
  const sb = makeSb(tenantId);
  const now = new Date();
  const todayStart = startOfTodayUTC(timezone);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const ids = kpiIds.filter(id => id in KPI_META);

  const needsThisWeek = ids.some(id => ["stops_this_week", "contacts_reached_week"].includes(id));
  const needsPrevWeek = ids.includes("stops_this_week");
  const needsOpps     = ids.some(id => ["open_opps", "pipeline_value", "win_rate"].includes(id));

  const [
    stopsToday,
    thisWeekStops,
    prevWeekCount,
    oppsRaw,
    activeLists,
    pastDueRaw,
    surveysThisWeek,
    newPeople,
  ] = await Promise.all([
    ids.includes("stops_today")
      ? sb.from("stops").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("stop_at", todayStart.toISOString()).then(r => r.count ?? 0)
      : Promise.resolve(0),

    needsThisWeek
      ? sb.from("stops").select("id, person_id").eq("tenant_id", tenantId).gte("stop_at", weekAgo.toISOString()).then(r => r.data ?? [])
      : Promise.resolve([] as any[]),

    needsPrevWeek
      ? sb.from("stops").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("stop_at", twoWeeksAgo.toISOString()).lt("stop_at", weekAgo.toISOString()).then(r => r.count ?? 0)
      : Promise.resolve(0),

    needsOpps
      ? sb.from("opportunities").select("stage, amount_cents, created_at").eq("tenant_id", tenantId).then(r => r.data ?? [])
      : Promise.resolve([] as any[]),

    ids.includes("active_lists")
      ? sb.from("walklists").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).then(r => r.count ?? 0)
      : Promise.resolve(0),

    ids.includes("past_due_sitrep")
      ? sb.from("sitrep_items").select("id, item_type, due_date, start_at").eq("tenant_id", tenantId).in("status", ["open", "in_progress"]).then(r => r.data ?? [])
      : Promise.resolve([] as any[]),

    ids.includes("surveys_completed_week")
      ? sb.from("surveys").select("id").eq("tenant_id", tenantId).then(async r => {
          const surveyIds = (r.data ?? []).map((s: any) => s.id);
          if (!surveyIds.length) return 0;
          const { count } = await sb.from("survey_sessions").select("*", { count: "exact", head: true }).in("survey_id", surveyIds).gte("completed_at", weekAgo.toISOString());
          return count ?? 0;
        })
      : Promise.resolve(0),

    ids.includes("new_people_week")
      ? Promise.resolve(sb.from("people").select("id, tenant_people!inner(tenant_id)", { count: "exact", head: true }).eq("tenant_people.tenant_id", tenantId).gte("created_at", weekAgo.toISOString())).then(r => r.count ?? 0).catch(() => 0)
      : Promise.resolve(0),
  ]);

  interface KpiCard {
    id: string; label: string; value: string; href: string; color: string;
    alertColor?: string; trend?: number;
  }

  const cards: KpiCard[] = ids.map(id => {
    const meta = KPI_META[id];
    let value = "—";
    let alertColor: string | undefined;
    let trend: number | undefined;

    switch (id) {
      case "stops_today":
        value = (stopsToday as number).toLocaleString();
        break;
      case "stops_this_week": {
        const n = (thisWeekStops as any[]).length;
        value = n.toLocaleString();
        trend = n - (prevWeekCount as number);
        break;
      }
      case "open_opps": {
        const n = (oppsRaw as any[]).filter(o => !["won", "lost"].includes(o.stage)).length;
        value = n.toLocaleString();
        break;
      }
      case "pipeline_value": {
        const total = (oppsRaw as any[]).filter(o => !["won", "lost"].includes(o.stage)).reduce((s, o) => s + (o.amount_cents ?? 0), 0);
        value = fmtCurrency(total) || "$0";
        break;
      }
      case "win_rate": {
        const recent = (oppsRaw as any[]).filter(o => new Date(o.created_at) >= thirtyDaysAgo);
        const won = recent.filter(o => o.stage === "won").length;
        const lost = recent.filter(o => o.stage === "lost").length;
        const total = won + lost;
        value = total > 0 ? `${Math.round((won / total) * 100)}%` : "—";
        break;
      }
      case "contacts_reached_week": {
        const n = new Set((thisWeekStops as any[]).filter((s: any) => s.person_id).map((s: any) => s.person_id)).size;
        value = n.toLocaleString();
        break;
      }
      case "active_lists":
        value = (activeLists as number).toLocaleString();
        break;
      case "past_due_sitrep": {
        const n = (pastDueRaw as any[]).filter(item => {
          const d = item.item_type === "task" ? item.due_date : item.start_at;
          return d && new Date(d) < now;
        }).length;
        value = n.toLocaleString();
        alertColor = n > 0 ? "#ef4444" : "#22c55e";
        break;
      }
      case "surveys_completed_week":
        value = (surveysThisWeek as number).toLocaleString();
        break;
      case "new_people_week":
        value = (newPeople as number).toLocaleString();
        break;
    }

    return { id, label: meta.label, value, href: meta.href, color: meta.color, alertColor, trend };
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 12 }}>
      {cards.map(kpi => (
        <Link key={kpi.id} href={kpi.href} className="db-kpi" style={{
          ...card,
          textDecoration: "none",
          color: "inherit",
          display: "block",
          boxShadow: `inset 3px 0 0 0 ${kpi.color}`,
          cursor: "pointer",
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: kpi.alertColor ?? S.text }}>
            {kpi.value}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: S.dim, marginTop: 6 }}>
            {kpi.label}
          </div>
          {kpi.trend !== undefined && (
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: kpi.trend > 0 ? "#22c55e" : kpi.trend < 0 ? "#ef4444" : S.dim }}>
              {kpi.trend > 0 ? "+" : ""}{kpi.trend} vs last week
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
