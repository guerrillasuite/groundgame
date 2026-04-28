import Link from "next/link";
import { S, makeSb, timeAgo, ProgressBar } from "./_helpers";

export async function FieldLists({ tenantId, userId }: { tenantId: string; userId: string }) {
  const sb = makeSb(tenantId);

  const { data: lists } = await sb
    .from("walklists")
    .select("id, name, mode")
    .eq("tenant_id", tenantId)
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (!lists?.length) {
    return (
      <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: 0 }}>
        No lists assigned yet.
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
  const lastStopAt = new Map<string, string>();
  for (const r of (itemsRes.data ?? []) as any[]) itemCounts.set(r.walklist_id, (itemCounts.get(r.walklist_id) ?? 0) + 1);
  for (const r of (stopsRes.data ?? []) as any[]) {
    stopCounts.set(r.walklist_id, (stopCounts.get(r.walklist_id) ?? 0) + 1);
    if (!lastStopAt.has(r.walklist_id)) lastStopAt.set(r.walklist_id, r.stop_at);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {(lists as any[]).map((list, i) => {
        const total = itemCounts.get(list.id) ?? 0;
        const done = Math.min(stopCounts.get(list.id) ?? 0, total);
        const pct = total > 0 ? (done / total) * 100 : 0;
        const last = lastStopAt.get(list.id);
        const isCall = list.mode === "call";
        const isDone = total > 0 && done >= total;
        const accentColor = isCall ? "#60a5fa" : "#34d399";
        return (
          <Link key={list.id} href={`/crm/lists/${list.id}`} className="db-list-row" style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 12px", borderRadius: 7,
            textDecoration: "none", color: "inherit",
            borderTop: i > 0 ? `1px solid ${S.border}` : "none",
            boxShadow: `inset 3px 0 0 0 ${accentColor}`,
          }}>
            <span style={{ fontSize: 14 }}>{isCall ? "📞" : "🚪"}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {list.name ?? "(Unnamed)"}
            </span>
            {isDone
              ? <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.25)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>DONE</span>
              : <div style={{ width: 80, flexShrink: 0 }}><ProgressBar pct={pct} color={accentColor} /></div>
            }
            <span style={{ fontSize: 12, fontWeight: 700, color: isDone ? "#22c55e" : S.dimBright, flexShrink: 0, minWidth: 36, textAlign: "right" }}>
              {total > 0 ? `${Math.round(pct)}%` : "—"}
            </span>
            <span style={{ fontSize: 10, color: S.dim, flexShrink: 0, minWidth: 48, textAlign: "right" }}>
              {last ? timeAgo(last) : "new"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
