import Link from "next/link";
import { S, makeSb, fmtCurrency, startOfTodayUTC } from "./_helpers";

const FIELD_KPI_META: Record<string, { label: string; href: string; color: string }> = {
  my_stops_today:          { label: "My Stops Today",       href: "/crm/stops",       color: "#22c55e" },
  my_lists:                { label: "My Active Lists",       href: "/crm/lists",       color: "#3b82f6" },
  my_past_due:             { label: "My Past Due",           href: "/crm/sitrep",      color: "#ef4444" },
  contacts_reached_today:  { label: "Contacts Reached",      href: "/crm/stops",       color: "#06b6d4" },
  active_ops:              { label: "My Open Opps",          href: "/crm/opportunities", color: "#8b5cf6" },
  my_pipeline_value:       { label: "My Pipeline",           href: "/crm/opportunities", color: "#f59e0b" },
};

async function fetchFieldKpiValue(
  id: string,
  tenantId: string,
  userId: string,
  sb: ReturnType<typeof import("./_helpers").makeSb>,
  timezone?: string
): Promise<{ value: string; alertColor?: string }> {
  const today = startOfTodayUTC(timezone);

  switch (id) {
    case "my_stops_today": {
      const { count } = await sb.from("stops").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("created_by", userId).gte("stop_at", today.toISOString());
      return { value: String(count ?? 0) };
    }
    case "my_lists": {
      const { count } = await sb.from("walklists").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("created_by", userId);
      return { value: String(count ?? 0) };
    }
    case "my_past_due": {
      const { count } = await sb.from("sitrep_items").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("created_by", userId)
        .in("status", ["open", "in_progress"])
        .lt("due_date", new Date().toISOString());
      const n = count ?? 0;
      return { value: String(n), alertColor: n > 0 ? "#ef4444" : "#22c55e" };
    }
    case "contacts_reached_today": {
      const { count } = await sb.from("stops").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("created_by", userId)
        .gte("stop_at", today.toISOString())
        .not("person_id", "is", null);
      return { value: String(count ?? 0) };
    }
    case "active_ops": {
      const { count } = await sb.from("opportunities").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("assigned_to", userId)
        .not("stage", "in", '("won","lost")');
      return { value: String(count ?? 0) };
    }
    case "my_pipeline_value": {
      const { data } = await sb.from("opportunities").select("value")
        .eq("tenant_id", tenantId).eq("assigned_to", userId)
        .not("stage", "in", '("won","lost")');
      const total = (data ?? []).reduce((sum: number, r: any) => sum + (r.value ?? 0), 0);
      return { value: fmtCurrency(total) || "$0" };
    }
    default:
      return { value: "—" };
  }
}

export async function FieldKpiRow({ tenantId, userId, kpiIds, timezone }: { tenantId: string; userId: string; kpiIds: string[]; timezone?: string }) {
  const sb = makeSb(tenantId);
  const ids = kpiIds.length > 0 ? kpiIds : ["my_stops_today", "my_lists", "my_past_due", "contacts_reached_today", "active_ops"];

  const results = await Promise.all(ids.map(id => fetchFieldKpiValue(id, tenantId, userId, sb, timezone)));

  const cards = ids.map((id, i) => ({
    id,
    meta: FIELD_KPI_META[id],
    ...results[i],
  })).filter(c => c.meta);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 12, marginBottom: 24 }}>
      {cards.map(c => (
        <Link key={c.id} href={c.meta.href} style={{
          display: "block",
          background: "rgb(20 25 38)",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 12,
          padding: "16px 18px",
          textDecoration: "none",
          color: "inherit",
          boxShadow: `inset 3px 0 0 0 ${c.alertColor ?? c.meta.color}`,
          transition: "background .12s ease, transform .12s ease",
        }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: S.dim }}>
            {c.meta.label}
          </p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: c.alertColor ?? S.text, lineHeight: 1 }}>
            {c.value}
          </p>
        </Link>
      ))}
    </div>
  );
}
