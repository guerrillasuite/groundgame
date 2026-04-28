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

  const listIds = lists.map((l: any) => l.id);
  const [itemsRes, stopsRes] = await Promise.all([
    sb.from("walklist_items").select("walklist_id").eq("tenant_id", tenantId).in("walklist_id", listIds),
    sb.from("stops").select("walklist_id, stop_at").eq("tenant_id", tenantId).in("walklist_id", listIds).order("stop_at", { ascending: false }),
  ]);

  const itemCounts = new Map<string, number>();
  const stopCounts = new Map<string, number>();
  for (const r of (itemsRes.data ?? []) as any[]) itemCounts.set(r.walklist_id, (itemCounts.get(r.walklist_id) ?? 0) + 1);
  for (const r of (stopsRes.data ?? []) as any[]) {
    stopCounts.set(r.walklist_id, (stopCounts.get(r.walklist_id) ?? 0) + 1);
  }

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
              padding: "10px 0",
              borderTop: i > 0 ? `1px solid ${S.border}` : "none",
              textDecoration: "none", color: "inherit",
              boxShadow: `inset 3px 0 0 0 ${accentColor}`,
              paddingLeft: 12,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{isCall ? "📞" : "🚪"}</span>
            <span style={{
              flex: 1, fontSize: 14, fontWeight: 500, color: S.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {list.name ?? "(Unnamed)"}
            </span>
            <div style={{ width: 120, flexShrink: 0 }}>
              <ProgressBar pct={pct} color={accentColor} />
            </div>
            <span style={{
              fontSize: 13, fontWeight: 700, flexShrink: 0, minWidth: 38, textAlign: "right",
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
