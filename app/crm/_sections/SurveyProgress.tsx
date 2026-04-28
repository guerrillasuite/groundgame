import Link from "next/link";
import { S, card, makeSb, ProgressBar } from "./_helpers";

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
    <details open style={{ ...card, boxShadow: "inset 3px 0 0 0 #8b5cf6", listStyle: "none", padding: 0 }}>
      <style>{`
        details.survey-card > summary { list-style: none; }
        details.survey-card > summary::-webkit-details-marker { display: none; }
        details.survey-card[open] .survey-chevron { transform: rotate(0deg); }
        details.survey-card:not([open]) .survey-chevron { transform: rotate(-90deg); }
      `}</style>
      <summary className="survey-card" style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 20px", cursor: "pointer",
        borderBottom: `1px solid ${S.border}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: S.dim, flex: 1 }}>
          📊 Survey Progress
        </span>
        <Link href="/crm/survey" style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", flexShrink: 0 }}>
          View all →
        </Link>
        <svg className="survey-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: "transform .2s ease" }}>
          <path d="M2.5 4.5L7 9.5L11.5 4.5" stroke={S.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {(surveys as any[]).map(survey => {
            const total = surveyTotal.get(survey.id) ?? 0;
            const done = surveyCompleted.get(survey.id) ?? 0;
            const pct = total > 0 ? (done / total) * 100 : 0;
            return (
              <Link key={survey.id} href={`/crm/survey/${survey.id}/results`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                <div className="db-list-row" style={{
                  padding: "12px 14px",
                  background: "rgba(255,255,255,.03)",
                  border: `1px solid ${S.border}`,
                  borderRadius: 8,
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
    </details>
  );
}
