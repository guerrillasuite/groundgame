import Link from "next/link";
import { S, makeSb, stageColor, fmtCurrency } from "./_helpers";

export async function PipelineKanban({ tenantId }: { tenantId: string }) {
  const sb = makeSb(tenantId);

  const [{ data: stages }, { data: opps }] = await Promise.all([
    sb.from("opportunity_stages").select("key, label, order_index").eq("tenant_id", tenantId).order("order_index"),
    sb.from("opportunities").select("stage, amount_cents").eq("tenant_id", tenantId),
  ]);

  // Dedup by key (some tenants have duplicates)
  const seen = new Set<string>();
  const rawList = (stages ?? []).length > 0 ? (stages as any[]) : [
    { key: "new",       label: "New",       order_index: 0 },
    { key: "contacted", label: "Contacted", order_index: 1 },
    { key: "qualified", label: "Qualified", order_index: 2 },
    { key: "proposal",  label: "Proposal",  order_index: 3 },
    { key: "won",       label: "Won",       order_index: 4 },
    { key: "lost",      label: "Lost",      order_index: 5 },
  ];
  const stageList = rawList.filter((s: any) => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });

  const oppByStage = new Map<string, { count: number; amount: number }>();
  let totalOpen = 0;
  let totalOpenValue = 0;
  for (const o of (opps ?? []) as any[]) {
    const s = oppByStage.get(o.stage) ?? { count: 0, amount: 0 };
    s.count++;
    s.amount += o.amount_cents ?? 0;
    oppByStage.set(o.stage, s);
    if (!["won", "lost"].includes(o.stage)) {
      totalOpen++;
      totalOpenValue += o.amount_cents ?? 0;
    }
  }

  if (stageList.length === 0) return <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: 0 }}>No pipeline stages configured.</p>;

  return (
    <>
      {totalOpen > 0 && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: S.dimBright }}>
          {fmtCurrency(totalOpenValue) || `${totalOpen} deal${totalOpen !== 1 ? "s" : ""}`} in play
        </p>
      )}
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 10, minWidth: "max-content" }}>
          {stageList.map((stage: any, i: number) => {
            const data = oppByStage.get(stage.key) ?? { count: 0, amount: 0 };
            const color = stageColor(stage.key, i, stageList.length);
            return (
              <Link
                key={stage.key}
                href={`/crm/opportunities?stage=${stage.key}`}
                className="db-stage-col"
                style={{
                  width: 150,
                  flexShrink: 0,
                  background: "rgba(255,255,255,.02)",
                  border: `1px solid ${S.border}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  textDecoration: "none",
                  color: "inherit",
                  boxShadow: `inset 0 3px 0 0 ${color}`,
                  display: "block",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: S.dim, marginBottom: 10 }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: data.count > 0 ? S.text : S.dim, lineHeight: 1 }}>
                  {data.count}
                </div>
                {data.amount > 0 && (
                  <div style={{ fontSize: 12, color, fontWeight: 600, marginTop: 4 }}>
                    {fmtCurrency(data.amount)}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
