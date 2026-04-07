import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { getSurveys, getWalklistsBySurvey } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";
import SurveyShareButton from "@/app/components/survey/SurveyShareButton";
import SurveyDuplicateButton from "@/app/components/survey/SurveyDuplicateButton";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const RESULT_COLORS: Record<string, string> = {
  libertarian: "#eab308",
  progressive: "#3b82f6",
  conservative: "#ef4444",
  authoritarian: "#6b7280",
  moderate: "#8b5cf6",
};

export default async function SurveyPage() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const [surveys, walklistMap] = await Promise.all([
    getSurveys(tenant.id),
    getWalklistsBySurvey(tenant.id),
  ]);

  // Fetch quiz stops for all WSPQ surveys
  const wspqIds = surveys.filter(s => s.id.startsWith("wspq-")).map(s => s.id);
  const quizStopsBySurvey = new Map<string, { result: string | null }[]>();
  if (wspqIds.length > 0) {
    const { data: stops } = await sb
      .from("stops")
      .select("result, notes")
      .eq("tenant_id", tenant.id)
      .eq("channel", "quiz");
    // Group by survey — all quiz stops for this tenant belong to their WSPQ survey
    // (there's only one active WSPQ per tenant, but future-proof by checking survey via stops notes or just aggregate)
    for (const sid of wspqIds) {
      quizStopsBySurvey.set(sid, stops ?? []);
    }
  }

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Surveys</h1>
          <p className="text-dim" style={{ marginTop: 6 }}>Manage and monitor your survey campaigns</p>
        </div>
        <Link
          href="/crm/survey/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "var(--gg-primary, #2563eb)",
            color: "white",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={16} />
          New Survey
        </Link>
      </div>

      {surveys.length === 0 ? (
        <div style={{ background: "var(--gg-card, white)", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ margin: "0 auto 16px", width: 64, height: 64, borderRadius: "50%", background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ClipboardList size={32} style={{ opacity: 0.4 }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Surveys Yet</h3>
          <p style={{ opacity: 0.7 }}>Create your first survey to get started</p>
        </div>
      ) : (
        <div className="stack">
          {surveys.map((survey) => {
            const completionRate =
              survey.total_responses > 0
                ? Math.round((survey.completed_responses / survey.total_responses) * 100)
                : 0;

            const isWspq = survey.id.startsWith("wspq-");
            const quizStops = isWspq ? (quizStopsBySurvey.get(survey.id) ?? []) : null;

            // Tally result counts for WSPQ
            const resultCounts: Record<string, number> = {};
            if (quizStops) {
              for (const s of quizStops) {
                const r = s.result ?? "unknown";
                resultCounts[r] = (resultCounts[r] ?? 0) + 1;
              }
            }

            return (
              <div
                key={survey.id}
                style={{
                  background: "var(--gg-card, white)",
                  borderRadius: 12,
                  padding: 20,
                  border: "1px solid var(--gg-border, #e5e7eb)",
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{survey.title}</h2>
                    <span style={{
                      padding: "4px 12px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      background: survey.active ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)",
                      color: survey.active ? "#16a34a" : "var(--gg-text-dim, #6b7280)",
                      border: `1px solid ${survey.active ? "rgba(34,197,94,0.3)" : "rgba(107,114,128,0.3)"}`,
                    }}>
                      {survey.active ? "Active" : "Inactive"}
                    </span>
                    {isWspq && (
                      <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "rgba(234,179,8,0.15)", color: "#d97706", border: "1px solid rgba(234,179,8,0.3)" }}>
                        Political Quiz
                      </span>
                    )}
                  </div>
                  {survey.description && (
                    <p style={{ opacity: 0.7, margin: "8px 0" }}>{survey.description}</p>
                  )}
                  <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
                    Created: {new Date(survey.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Assigned lists */}
                {(() => {
                  const lists = walklistMap.get(survey.id) ?? [];
                  return (
                    <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.5 }}>Assigned to:</span>
                      {lists.length === 0 ? (
                        <span style={{ fontSize: 12, opacity: 0.5 }}>No lists</span>
                      ) : (
                        lists.map((l) => (
                          <Link
                            key={l.id}
                            href={`/crm/lists/${l.id}`}
                            style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "rgba(59,130,246,0.1)", color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                          >
                            {l.name}
                          </Link>
                        ))
                      )}
                    </div>
                  );
                })()}

                {/* Stats */}
                {isWspq && quizStops ? (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
                      <div style={{ background: "rgba(234,179,8,0.1)", borderRadius: 8, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>Quiz Submissions</div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{quizStops.length}</div>
                      </div>
                      <div style={{ background: "rgba(59,130,246,0.1)", borderRadius: 8, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>Survey Sessions</div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{survey.total_responses}</div>
                      </div>
                    </div>
                    {quizStops.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {Object.entries(resultCounts).sort((a, b) => b[1] - a[1]).map(([res, count]) => (
                          <span key={res} style={{
                            padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: `${RESULT_COLORS[res] ?? "#6b7280"}18`,
                            color: RESULT_COLORS[res] ?? "#6b7280",
                            border: `1px solid ${RESULT_COLORS[res] ?? "#6b7280"}33`,
                          }}>
                            {res.charAt(0).toUpperCase() + res.slice(1)}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                    <div style={{ background: "rgba(59,130,246,0.1)", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>Total Started</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{survey.total_responses}</div>
                    </div>
                    <div style={{ background: "rgba(34,197,94,0.1)", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>Completed</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{survey.completed_responses}</div>
                    </div>
                    <div style={{ background: "rgba(168,85,247,0.1)", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>Completion Rate</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{completionRate}%</div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    href={`/crm/survey/${survey.id}/results`}
                    style={{ flex: 1, padding: "10px 16px", background: "var(--gg-primary, #2563eb)", color: "white", borderRadius: 8, fontWeight: 600, textAlign: "center", textDecoration: "none", display: "block" }}
                  >
                    View Results
                  </Link>
                  <Link
                    href={`/crm/survey/${survey.id}/edit`}
                    style={{ padding: "10px 16px", border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", color: "var(--gg-text, inherit)", borderRadius: 8, fontWeight: 600, textDecoration: "none", display: "block" }}
                  >
                    Edit
                  </Link>
                  {isWspq && (
                    <a
                      href={`/s/${survey.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: "10px 16px", background: "rgba(234,179,8,0.12)", color: "#b45309", borderRadius: 8, fontWeight: 600, textDecoration: "none", display: "block", border: "1px solid rgba(234,179,8,0.3)" }}
                    >
                      Open Quiz ↗
                    </a>
                  )}
                  {!isWspq && (
                    <a
                      href={`/s/${survey.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: "10px 16px", border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", color: "var(--gg-text, inherit)", borderRadius: 8, fontWeight: 600, textDecoration: "none", display: "block" }}
                    >
                      Preview ↗
                    </a>
                  )}
                  <a
                    href={`/api/survey/${survey.id}/export`}
                    download
                    style={{ padding: "10px 16px", background: "#22c55e", color: "white", borderRadius: 8, fontWeight: 600, textDecoration: "none", display: "block" }}
                  >
                    Export
                  </a>
                  <SurveyDuplicateButton surveyId={survey.id} />
                  <SurveyShareButton surveyId={survey.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
