import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { getSurveys, getWalklistsBySurvey } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";
import SurveyShareButton from "@/app/components/survey/SurveyShareButton";

export default async function SurveyPage() {
  const tenant = await getTenant();
  const [surveys, walklistMap] = await Promise.all([
    getSurveys(tenant.id),
    getWalklistsBySurvey(tenant.id),
  ]);

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
        <div style={{
          background: "var(--gg-card, white)",
          borderRadius: 12,
          padding: 48,
          textAlign: "center",
        }}>
          <div style={{
            margin: "0 auto 16px",
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
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
                      background: survey.active ? "#dcfce7" : "#f3f4f6",
                      color: survey.active ? "#166534" : "#374151",
                    }}>
                      {survey.active ? "Active" : "Inactive"}
                    </span>
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
                            style={{
                              fontSize: 12,
                              padding: "3px 10px",
                              borderRadius: 20,
                              background: "rgba(59,130,246,0.1)",
                              color: "#2563eb",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            {l.name}
                          </Link>
                        ))
                      )}
                    </div>
                  );
                })()}

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

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    href={`/crm/survey/${survey.id}/results`}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      background: "var(--gg-primary, #2563eb)",
                      color: "white",
                      borderRadius: 8,
                      fontWeight: 600,
                      textAlign: "center",
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    View Results
                  </Link>
                  <Link
                    href={`/crm/survey/${survey.id}/edit`}
                    style={{
                      padding: "10px 16px",
                      background: "rgba(0,0,0,0.05)",
                      color: "inherit",
                      borderRadius: 8,
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/survey/${survey.id}?contact_id=PREVIEW`}
                    target="_blank"
                    style={{
                      padding: "10px 16px",
                      background: "rgba(0,0,0,0.05)",
                      color: "inherit",
                      borderRadius: 8,
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    Preview
                  </Link>
                  <a
                    href={`/api/survey/${survey.id}/export`}
                    download
                    style={{
                      padding: "10px 16px",
                      background: "#22c55e",
                      color: "white",
                      borderRadius: 8,
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    Export
                  </a>
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
