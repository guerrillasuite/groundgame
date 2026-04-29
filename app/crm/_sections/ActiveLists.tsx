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
    sb.from("walklist_items").select("id, walklist_id").eq("tenant_id", tenantId).in("walklist_id", listIds),
    sb.from("stops").select("walklist_item_id").eq("tenant_id", tenantId).in("walklist_id", listIds).not("walklist_item_id", "is", null),
  ]);

  const itemCounts = new Map<string, number>();
  for (const r of (itemsRes.data ?? []) as any[]) itemCounts.set(r.walklist_id, (itemCounts.get(r.walklist_id) ?? 0) + 1);

  // Build set of all item IDs per list so we can count distinct visited items
  const itemListMap = new Map<string, string>();
  for (const r of (itemsRes.data ?? []) as any[]) itemListMap.set(r.id, r.walklist_id);

  const visitedItems = new Map<string, Set<string>>();
  for (const r of (stopsRes.data ?? []) as any[]) {
    const listId = itemListMap.get(r.walklist_item_id);
    if (!listId) continue;
    if (!visitedItems.has(listId)) visitedItems.set(listId, new Set());
    visitedItems.get(listId)!.add(r.walklist_item_id);
  }
  const stopCounts = new Map<string, number>(
    [...visitedItems.entries()].map(([k, v]) => [k, v.size])
  );

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
