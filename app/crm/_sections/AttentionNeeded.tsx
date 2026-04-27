import Link from "next/link";
import { S, makeSb, sitrepEffectiveDate } from "./_helpers";

export async function AttentionNeeded({ tenantId }: { tenantId: string }) {
  const sb = makeSb(tenantId);
  const now = new Date();

  const [{ data: sitrepRaw }, { data: lists }] = await Promise.all([
    sb.from("sitrep_items")
      .select("id, item_type, due_date, start_at, title")
      .eq("tenant_id", tenantId)
      .in("status", ["open", "in_progress"])
      .limit(20),
    sb.from("walklists")
      .select("id, name, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const overdueItems = (sitrepRaw ?? []).filter(item => {
    const d = sitrepEffectiveDate(item);
    return d && new Date(d) < now;
  });

  const listIds = (lists ?? []).map((l: any) => l.id);

  let itemCounts = new Map<string, number>();
  let stopCounts = new Map<string, number>();

  if (listIds.length > 0) {
    const [itemsRes, stopsRes] = await Promise.all([
      sb.from("walklist_items").select("walklist_id").eq("tenant_id", tenantId).in("walklist_id", listIds),
      sb.from("stops").select("walklist_id").eq("tenant_id", tenantId).in("walklist_id", listIds),
    ]);
    for (const r of (itemsRes.data ?? []) as any[]) itemCounts.set(r.walklist_id, (itemCounts.get(r.walklist_id) ?? 0) + 1);
    for (const r of (stopsRes.data ?? []) as any[]) stopCounts.set(r.walklist_id, (stopCounts.get(r.walklist_id) ?? 0) + 1);
  }

  const staleLists = (lists ?? []).filter((l: any) => !stopCounts.has(l.id) && new Date(l.created_at) < new Date(now.getTime() - 86400000));
  const nearlyDone = (lists ?? []).filter((l: any) => {
    const total = itemCounts.get(l.id) ?? 0;
    const done = stopCounts.get(l.id) ?? 0;
    return total > 0 && done / total >= 0.9;
  });

  if (overdueItems.length === 0 && staleLists.length === 0 && nearlyDone.length === 0) return null;

  return (
    <div style={{
      background: "rgba(239,68,68,0.07)",
      border: "1px solid rgba(239,68,68,0.22)",
      borderRadius: 12,
      padding: "16px 20px",
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: S.dim, margin: "0 0 10px" }}>
        ⚠ Attention Needed
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {overdueItems.length > 0 && (
          <Link href="/crm/sitrep" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "6px 0" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>
              {overdueItems.length} past-due item{overdueItems.length !== 1 ? "s" : ""} on the board — act now
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: S.dim }}>→</span>
          </Link>
        )}
        {staleLists.map((l: any) => (
          <Link key={l.id} href={`/crm/lists/${l.id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "6px 0" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>"{l.name}" has 0 stops — no one's worked it yet</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: S.dim }}>→</span>
          </Link>
        ))}
        {nearlyDone.map((l: any) => {
          const pct = Math.round(((stopCounts.get(l.id) ?? 0) / Math.max(1, itemCounts.get(l.id) ?? 1)) * 100);
          return (
            <Link key={l.id} href={`/crm/lists/${l.id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "6px 0" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>"{l.name}" is {pct}% complete — almost done!</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: S.dim }}>→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
