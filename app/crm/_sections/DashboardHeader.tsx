import { S, makeSb } from "./_helpers";

export async function DashboardHeader({
  tenantId,
  tenantName,
  userName,
}: {
  tenantId: string;
  tenantName: string;
  userName: string;
}) {
  const sb = makeSb(tenantId);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const { count: stopsToday } = await sb
    .from("stops")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("stop_at", todayStart.toISOString());

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ borderBottom: `1px solid ${S.border}`, paddingBottom: 18 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: S.text }}>
        {greeting}{userName ? `, ${userName.split(" ")[0]}` : ""} 👋
      </h1>
      <p style={{ margin: "4px 0 0", color: S.dim, fontSize: 14 }}>
        <span style={{ color: S.dimBright }}>{tenantName}</span>
        {" · "}
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        {(stopsToday ?? 0) > 0 && (
          <span style={{ color: S.dimBright }}>
            {" · "}{(stopsToday ?? 0).toLocaleString()} stop{stopsToday !== 1 ? "s" : ""} logged today
          </span>
        )}
      </p>
    </div>
  );
}
