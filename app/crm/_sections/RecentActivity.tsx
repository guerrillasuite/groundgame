import Link from "next/link";
import { resolveDispoConfig, buildColorMap } from "@/lib/dispositionConfig";
import { S, card, sectionLabel, makeSb, timeAgo, Dot } from "./_helpers";

export async function RecentActivity({ tenantId, settings }: { tenantId: string; settings: any }) {
  const sb = makeSb(tenantId);
  const colorMap = buildColorMap(resolveDispoConfig(settings ?? {}));

  const { data: stopsRaw } = await sb
    .from("stops")
    .select("id, stop_at, result, person_id, channel")
    .eq("tenant_id", tenantId)
    .order("stop_at", { ascending: false })
    .limit(20);

  const stops = stopsRaw ?? [];
  const personIds = [...new Set(stops.filter((s: any) => s.person_id).map((s: any) => s.person_id))].slice(0, 200) as string[];

  const personMap = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: people } = await sb.from("people").select("id, first_name, last_name").in("id", personIds);
    for (const p of (people ?? []) as any[]) {
      personMap.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown");
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...sectionLabel, margin: 0 }}>⚡ Recent Activity</p>
        <Link href="/crm/stops" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>All activity →</Link>
      </div>
      {stops.length === 0
        ? <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: "4px 0" }}>No stops recorded yet. Time to hit the field.</p>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {(stops as any[]).slice(0, 12).map((stop, i) => {
              const color = colorMap[stop.result] ?? "#9ca3af";
              const name = stop.person_id ? (personMap.get(stop.person_id) ?? "Unknown") : "—";
              const href = stop.person_id ? `/crm/people/${stop.person_id}` : null;
              const rowStyle: React.CSSProperties = {
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 8px", borderRadius: 6,
                borderTop: i > 0 ? `1px solid ${S.border}` : "none",
                textDecoration: "none", color: "inherit",
                transition: "background .12s ease",
              };
              const inner = <>
                <Dot color={color} />
                <span style={{ fontSize: 11, color: S.dim, flexShrink: 0 }}>
                  {stop.channel === "call" ? "📞" : "🚪"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 11, color, fontWeight: 600, flexShrink: 0 }}>{stop.result ?? "—"}</span>
                <span style={{ fontSize: 10, color: S.dim, flexShrink: 0 }}>{timeAgo(stop.stop_at)}</span>
              </>;
              return href
                ? <Link key={stop.id} href={href} className="db-stop-row" style={rowStyle}>{inner}</Link>
                : <div key={stop.id} className="db-stop-row" style={rowStyle}>{inner}</div>;
            })}
          </div>
        )
      }
    </div>
  );
}
