import Link from "next/link";
import { S, makeSb, ProgressBar } from "./_helpers";

export async function ActiveLists({ tenantId }: { tenantId: string }) {
  const sb = makeSb(tenantId);

  const { data: lists } = await sb
    .from("walklists")
    .select("id, name, mode")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!lists?.length) {
    return (
      <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: 0 }}>
        No active lists yet.
      </p>
    );
  }

  // Per-list parallel queries avoid PostgREST's 1000-row cap on batch fetches.
  // Stops are deduplicated by person_id/location_id since walklist_item_id isn't
  // always set (calls/texts made outside the PWA walklist flow).
  const progressData = await Promise.all(
    (lists as any[]).map(async (list) => {
      const [{ count: total }, { data: stopsData }] = await Promise.all([
        sb.from("walklist_items")
          .select("*", { count: "exact", head: true })
          .eq("walklist_id", list.id)
          .eq("tenant_id", tenantId),
        sb.from("stops")
          .select("person_id, location_id")
          .eq("walklist_id", list.id)
          .eq("tenant_id", tenantId)
          .limit(2000),
      ]);
      const visited = new Set(
        (stopsData ?? []).map((s: any) => s.person_id ?? s.location_id).filter(Boolean)
      ).size;
      return { id: list.id, total: total ?? 0, visited };
    })
  );

  const itemCounts = new Map(progressData.map(d => [d.id, d.total]));
  const stopCounts = new Map(progressData.map(d => [d.id, d.visited]));

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {(lists as any[]).map((list, i) => {
        const total = itemCounts.get(list.id) ?? 0;
        const done = Math.min(stopCounts.get(list.id) ?? 0, total);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isCall = list.mode === "call";
        const accentColor = isCall ? "#60a5fa" : "#34d399";
        return (
          <Link
            key={list.id}
            href={`/crm/lists/${list.id}`}
            className="db-list-row"
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px",
              borderTop: i > 0 ? `1px solid ${S.border}` : "none",
              textDecoration: "none", color: "inherit",
              boxShadow: `inset 3px 0 0 0 ${accentColor}`,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{isCall ? "📞" : "🚪"}</span>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: S.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {list.name ?? "(Unnamed)"}
            </span>
            <div style={{ width: 100, flexShrink: 0 }}>
              <ProgressBar pct={pct} color={accentColor} />
            </div>
            <span style={{
              fontSize: 13, fontWeight: 700, flexShrink: 0, minWidth: 34, textAlign: "right",
              color: pct >= 100 ? "#22c55e" : S.dimBright,
            }}>
              {total > 0 ? `${pct}%` : "—"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
