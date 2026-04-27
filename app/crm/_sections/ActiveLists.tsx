import Link from "next/link";
import { S, card, sectionLabel, makeSb, timeAgo, ProgressBar } from "./_helpers";

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
      <div style={card}>
        <p style={sectionLabel}>📋 Active Lists</p>
        <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: "4px 0" }}>
          No active lists yet.{" "}
          <Link href="/crm/lists" style={{ color: "var(--gg-primary, #2563eb)" }}>Create one in Lists →</Link>
        </p>
      </div>
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
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...sectionLabel, margin: 0 }}>📋 Active Lists</p>
        <Link href="/crm/lists" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
      </div>
      <style>{`
        .db-list-row:hover { background: rgba(255,255,255,.03) !important; transform: translateX(2px); }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(lists as any[]).map((list, i) => {
          const total = itemCounts.get(list.id) ?? 0;
          const done = Math.min(stopCounts.get(list.id) ?? 0, total);
          const pct = total > 0 ? (done / total) * 100 : 0;
          const last = lastStopAt.get(list.id);
          const isCall = list.mode === "call";
          return (
            <Link key={list.id} href={`/crm/lists/${list.id}`} className="db-list-row" style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 7,
              textDecoration: "none", color: "inherit",
              borderTop: i > 0 ? `1px solid ${S.border}` : "none",
              transition: "transform .12s ease, background .12s ease",
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, flexShrink: 0,
                background: isCall ? "rgba(59,130,246,.12)" : "rgba(16,185,129,.12)",
                color: isCall ? "#60a5fa" : "#34d399",
                border: `1px solid ${isCall ? "rgba(59,130,246,.2)" : "rgba(16,185,129,.2)"}`,
              }}>
                {isCall ? "CALL" : "KNOCK"}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {list.name ?? "(Unnamed)"}
              </span>
              <div style={{ width: 120, flexShrink: 0 }}>
                <ProgressBar pct={pct} />
              </div>
              <span style={{ fontSize: 12, color: S.dimBright, flexShrink: 0, minWidth: 52, textAlign: "right" }}>
                {total > 0 ? `${done}/${total}` : "empty"}
              </span>
              <span style={{ fontSize: 11, color: S.dim, flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                {last ? timeAgo(last) : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
