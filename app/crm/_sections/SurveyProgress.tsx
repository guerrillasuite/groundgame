import Link from "next/link";
import { S, card, sectionLabel, makeSb, ProgressBar } from "./_helpers";

export async function SurveyProgress({ tenantId }: { tenantId: string }) {
  const sb = makeSb(tenantId);

  const { data: surveys } = await sb
    .from("surveys")
    .select("id, title")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .limit(6);

  if (!surveys?.length) return null;

  const surveyIds = surveys.map((s: any) => s.id);
  const { data: sessions } = await sb
    .from("survey_sessions")
    .select("survey_id, completed_at")
    .in("survey_id", surveyIds);

  const surveyTotal = new Map<string, number>();
  const surveyCompleted = new Map<string, number>();
  for (const r of (sessions ?? []) as any[]) {
    surveyTotal.set(r.survey_id, (surveyTotal.get(r.survey_id) ?? 0) + 1);
    if (r.completed_at) surveyCompleted.set(r.survey_id, (surveyCompleted.get(r.survey_id) ?? 0) + 1);
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...sectionLabel, margin: 0 }}>📊 Survey Progress</p>
        <Link href="/crm/survey" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {(surveys as any[]).map(survey => {
          const total = surveyTotal.get(survey.id) ?? 0;
          const done = surveyCompleted.get(survey.id) ?? 0;
          const pct = total > 0 ? (done / total) * 100 : 0;
          return (
            <Link key={survey.id} href={`/crm/survey/${survey.id}/results`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
              <div className="db-list-row" style={{
                padding: "12px 14px",
                background: "rgba(255,255,255,.04)",
                border: `1px solid ${S.border}`,
                borderRadius: 8,
                transition: "background .12s ease",
              }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {survey.title}
                </p>
                <ProgressBar pct={pct} color="#8b5cf6" />
                <p style={{ margin: "6px 0 0", fontSize: 11, color: S.dim }}>
                  {done} completed · {total} total
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
