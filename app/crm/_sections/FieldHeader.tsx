import { S, makeSb } from "./_helpers";

export async function FieldHeader({ tenantId, userId, userName }: { tenantId: string; userId: string; userName: string }) {
  const sb = makeSb(tenantId);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { count: stopsToday } = await sb
    .from("stops")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("created_by", userId)
    .gte("stop_at", today.toISOString());

  const n = stopsToday ?? 0;
  const greeting = `Hey, ${userName || "there"}`;
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ marginBottom: 4 }}>
      {n > 0 && (
        <div style={{
          background: "rgba(34,197,94,.1)",
          border: "1px solid rgba(34,197,94,.25)",
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 16,
          fontSize: 14,
          color: "#4ade80",
          fontWeight: 600,
        }}>
          🔥 You&apos;ve logged {n} stop{n !== 1 ? "s" : ""} today. Keep it up!
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 16, borderBottom: `1px solid ${S.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: S.text, lineHeight: 1.2 }}>{greeting}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>{dateStr}</p>
        </div>
      </div>
    </div>
  );
}
