// app/components/survey/ResultsDashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface QuestionResult {
  question_id: string;
  question_text: string;
  question_type?: string;
  total_responses: number;
  answers: {
    value: string;
    count: number;
    percentage: number;
    // Approval voting
    approve?: number;
    neutral?: number;
    disapprove?: number;
    approvePercent?: number;
    neutralPercent?: number;
    disapprovePercent?: number;
    // STAR voting
    totalScore?: number;
    averageScore?: number;
  }[];
  starRunoff?: {
    finalist1: string;
    finalist2: string;
    finalist1Preferences: number;
    finalist2Preferences: number;
    ties: number;
    winner: string | null;
  };
}

interface QuizDot { personalScore: number; economicScore: number; result: string }

interface SurveyStats {
  survey_id: string;
  survey_title: string;
  total_started: number;
  total_completed: number;
  completion_rate: number;
  questions: QuestionResult[];
  quizData?: { dots: QuizDot[]; resultCounts: Record<string, number> };
}

interface Respondent {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  completed_at: string | null;
  answers: Record<string, string>;
  personFields?: Record<string, any>;
}

interface ResponsesData {
  survey_id: string;
  survey_title: string;
  questions: { id: string; question_text: string; order_index: number }[];
  respondents: Respondent[];
  personFieldDefs?: { key: string; label: string }[];
}

const PERSON_FIELD_GROUPS = [
  { group: "Voter Data", fields: [
    { key: "party", label: "Party" },
    { key: "voter_status", label: "Voter Status" },
    { key: "voting_frequency", label: "Voting Frequency" },
    { key: "voted_general_2024", label: "Voted General 2024" },
    { key: "voted_general_2022", label: "Voted General 2022" },
    { key: "voted_general_2020", label: "Voted General 2020" },
    { key: "voted_primary_2024", label: "Voted Primary 2024" },
    { key: "voted_primary_2022", label: "Voted Primary 2022" },
  ]},
  { group: "Political Scores", fields: [
    { key: "nolan_personal_score", label: "Nolan: Personal Freedom" },
    { key: "nolan_economic_score", label: "Nolan: Economic Freedom" },
    { key: "likelihood_to_vote", label: "Likelihood to Vote" },
    { key: "primary_likelihood", label: "Primary Likelihood" },
    { key: "score_prog_dem", label: "Score: Prog. Dem" },
    { key: "score_mod_dem", label: "Score: Mod. Dem" },
    { key: "score_cons_rep", label: "Score: Cons. Rep" },
    { key: "score_mod_rep", label: "Score: Mod. Rep" },
  ]},
  { group: "Demographics", fields: [
    { key: "gender", label: "Gender" },
    { key: "age", label: "Age" },
    { key: "birth_date", label: "Birth Date" },
    { key: "ethnicity", label: "Ethnicity" },
    { key: "education_level", label: "Education Level" },
    { key: "marital_status", label: "Marital Status" },
  ]},
  { group: "Address", fields: [
    { key: "mailing_address", label: "Mailing Address" },
    { key: "mailing_city", label: "City" },
    { key: "mailing_state", label: "State" },
    { key: "mailing_zip", label: "Zip" },
  ]},
  { group: "Contact / Other", fields: [
    { key: "phone_cell", label: "Cell Phone" },
    { key: "phone2", label: "Phone 2" },
    { key: "email2", label: "Email 2" },
    { key: "occupation", label: "Occupation" },
    { key: "contact_type", label: "Contact Type" },
    { key: "top_issues", label: "Top Issues" },
  ]},
];

const RESULT_COLORS: Record<string, string> = {
  libertarian: "#eab308",
  progressive: "#3b82f6",
  conservative: "#ef4444",
  authoritarian: "#1e293b",
  moderate: "#64748b",
};

function AggregateNolanChart({ dots }: { dots: QuizDot[] }) {
  const cx = 200, cy = 200, r = 170;
  const T  = [cx,     cy - r] as const;
  const L  = [cx - r, cy    ] as const;
  const B  = [cx,     cy + r] as const;
  const R  = [cx + r, cy    ] as const;
  const ro = r / 2, ri = r * 0.35;
  const TL  = [cx - ro, cy - ro] as const;
  const TR  = [cx + ro, cy - ro] as const;
  const BL  = [cx - ro, cy + ro] as const;
  const BR  = [cx + ro, cy + ro] as const;
  const TLi = [cx - ri, cy - ri] as const;
  const TRi = [cx + ri, cy - ri] as const;
  const BLi = [cx - ri, cy + ri] as const;
  const BRi = [cx + ri, cy + ri] as const;
  const pts = (...coords: readonly (readonly [number, number])[]) =>
    coords.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg viewBox="0 0 420 420" width={360} height={360} style={{ display: "block", maxWidth: "100%" }}
      aria-label="Aggregate Nolan Chart">
      <defs>
        <clipPath id="agg-clip">
          <polygon points={pts(T, R, B, L)} />
        </clipPath>
      </defs>
      <g clipPath="url(#agg-clip)">
        <polygon points={pts(T, TR, TRi, TLi, TL)} fill="rgba(234,179,8,0.35)" />
        <polygon points={pts(L, TL, TLi, BLi, BL)} fill="rgba(59,130,246,0.3)" />
        <polygon points={pts(R, TR, TRi, BRi, BR)} fill="rgba(239,68,68,0.3)" />
        <polygon points={pts(B, BL, BLi, BRi, BR)} fill="rgba(20,30,48,0.75)" />
        <polygon points={pts(TLi, TRi, BRi, BLi)}  fill="rgba(100,116,139,0.35)" />
      </g>
      <g clipPath="url(#agg-clip)">
        <line x1={TL[0]} y1={TL[1]} x2={BR[0]} y2={BR[1]} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        <line x1={TR[0]} y1={TR[1]} x2={BL[0]} y2={BL[1]} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      </g>
      <polygon points={pts(T, R, B, L)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
      {/* Zone labels */}
      <text x={cx}          y={cy - r + 30} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}  fontWeight={700} letterSpacing={0.8}>LIBERTARIAN</text>
      <text x={cx - r + 40} y={cy + 4}      textAnchor="middle" fill="rgba(255,255,255,0.8)"  fontSize={8}  fontWeight={700} letterSpacing={0.5} transform={`rotate(-45,${cx - r + 40},${cy})`}>PROGRESSIVE</text>
      <text x={cx + r - 40} y={cy + 4}      textAnchor="middle" fill="rgba(255,255,255,0.8)"  fontSize={8}  fontWeight={700} letterSpacing={0.5} transform={`rotate(45,${cx + r - 40},${cy})`}>CONSERVATIVE</text>
      <text x={cx}          y={cy + r - 24} textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize={9}  fontWeight={700} letterSpacing={0.8}>AUTHORITARIAN</text>
      <text x={cx}          y={cy + 4}      textAnchor="middle" fill="rgba(255,255,255,0.7)"  fontSize={8}  fontWeight={700} letterSpacing={0.5}>MODERATE</text>
      {/* Response dots */}
      <g clipPath="url(#agg-clip)">
        {dots.map((d, i) => {
          const dx = cx + r * (d.economicScore - d.personalScore) / 100;
          const dy = cy - r * (d.economicScore + d.personalScore - 100) / 100;
          const color = RESULT_COLORS[d.result] ?? "#64748b";
          return (
            <circle key={i} cx={dx} cy={dy} r={5}
              fill={color} fillOpacity={0.75} stroke="white" strokeWidth={1} strokeOpacity={0.6} />
          );
        })}
      </g>
    </svg>
  );
}

interface ResultsDashboardProps {
  surveyId: string;
}

export function ResultsDashboard({ surveyId }: ResultsDashboardProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [tab, setTab] = useState<"summary" | "ind-response">(
    (searchParams.get("tab") as "summary" | "ind-response") || "summary"
  );

  function switchTab(t: "summary" | "ind-response") {
    setTab(t);
    const p = new URLSearchParams(searchParams.toString());
    if (t === "summary") p.delete("tab"); else p.set("tab", t);
    router.replace(`?${p}`);
  }
  const [responsesData, setResponsesData] = useState<ResponsesData | null>(null);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responseSearch, setResponseSearch] = useState("");
  const [sortCol, setSortCol] = useState<string>("completed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [showColPicker, setShowColPicker] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);

  const fetchResults = async () => {
    try {
      const response = await fetch(`/api/survey/${surveyId}/results`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch results');
      }

      const data = await response.json();
      setStats(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching results:', err);
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async (cols: string[] = []) => {
    setResponsesLoading(true);
    try {
      const qs = cols.length ? `&extra_fields=${cols.join(",")}` : "";
      const res = await fetch(`/api/survey/${surveyId}/export?format=json${qs}`);
      if (!res.ok) throw new Error("Failed to load responses");
      const data = await res.json();
      setResponsesData(data);
      setPage(0);
    } catch (err) {
      console.error("Error fetching responses:", err);
    } finally {
      setResponsesLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 30000);
    return () => clearInterval(interval);
  }, [surveyId]);

  useEffect(() => {
    if (tab === "ind-response") fetchResponses(extraCols);
  }, [tab, extraCols]);

  const handleExport = async (format: 'csv' | 'json' = 'csv') => {
    try {
      const response = await fetch(`/api/survey/${surveyId}/export?format=${format}`);
      if (!response.ok) throw new Error('Export failed');
      
      if (format === 'csv') {
        // Download CSV directly
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `survey-${surveyId}-export-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Download JSON
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `survey-${surveyId}-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export data. Please try again.');
    }
  };

  if (loading) {
    return (
      <section className="stack" style={{ padding: 16 }}>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ 
            margin: '0 auto 16px',
            width: 48,
            height: 48,
            border: '3px solid rgba(0,0,0,0.1)',
            borderTopColor: 'var(--gg-primary, #2563eb)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ opacity: 0.7 }}>Loading results...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack" style={{ padding: 16 }}>
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#991b1b' }}>
            Error Loading Results
          </h3>
          <p style={{ opacity: 0.8, marginBottom: 16 }}>{error}</p>
          <button
            onClick={fetchResults}
            style={{
              padding: '10px 20px',
              background: 'var(--gg-primary, #2563eb)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="stack" style={{ padding: 16 }}>
        <div style={{
          background: 'var(--gg-card, white)',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center'
        }}>
          <p style={{ opacity: 0.7 }}>No survey data found.</p>
        </div>
      </section>
    );
  }

  const tabStyle = (t: "summary" | "ind-response") => ({
    padding: "8px 18px",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer" as const,
    border: "none",
    background: tab === t ? "var(--gg-primary, #2563eb)" : "rgba(0,0,0,0.05)",
    color: tab === t ? "white" : "inherit",
  });

  return (
    <section className="stack" style={{ padding: 16 }}>
      <a href="/crm/survey" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, opacity: 0.6, textDecoration: 'none' }}>
        ← Surveys
      </a>
      {/* Header */}
      <div style={{
        background: 'var(--gg-card, white)',
        borderRadius: 12,
        padding: 20,
        border: '1px solid var(--gg-border, #e5e7eb)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0' }}>
              {stats.survey_title}
            </h1>
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleExport('csv')}
              style={{
                padding: '10px 16px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12
        }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
              Total Started
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total_started}</div>
          </div>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
              Completed
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total_completed}</div>
          </div>
          <div style={{ background: 'rgba(168, 85, 247, 0.1)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
              Completion Rate
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {Math.round(stats.completion_rate)}%
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={tabStyle("summary")} onClick={() => switchTab("summary")}>Summary</button>
        <button style={tabStyle("ind-response")} onClick={() => switchTab("ind-response")}>Individual Responses</button>
      </div>

      {/* ── Responses tab ── */}
      {tab === "ind-response" && (
        <div style={{ background: "var(--gg-card, white)", borderRadius: 12, border: "1px solid var(--gg-border, #e5e7eb)", overflow: "hidden" }}>
          {/* Search + count + Columns button */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--gg-border, #e5e7eb)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Search by name, email, or phone…"
              value={responseSearch}
              onChange={(e) => { setResponseSearch(e.target.value); setPage(0); }}
              style={{ flex: 1, minWidth: 160, padding: "7px 12px", borderRadius: 6, border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 13, background: "transparent", color: "inherit" }}
            />
            {responsesData && (
              <span style={{ fontSize: 13, opacity: 0.6, whiteSpace: "nowrap" }}>
                {responsesData.respondents.length} respondent{responsesData.respondents.length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={() => setShowColPicker(v => !v)}
              style={{
                padding: "7px 14px", borderRadius: 6, border: "1px solid var(--gg-border, #e5e7eb)",
                background: showColPicker ? "var(--gg-primary, #2563eb)" : "transparent",
                color: showColPicker ? "white" : "inherit",
                fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Columns{extraCols.length > 0 ? ` (${extraCols.length})` : ""}
            </button>
          </div>

          {/* Column picker panel */}
          {showColPicker && (
            <div style={{ padding: "16px", borderBottom: "1px solid var(--gg-border, #e5e7eb)", background: "rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.5, marginBottom: 12 }}>
                Add Person Record Fields
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                {PERSON_FIELD_GROUPS.map(({ group, fields }) => (
                  <div key={group} style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.45, marginBottom: 6 }}>{group}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {fields.map(({ key, label }) => (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={extraCols.includes(key)}
                            onChange={(e) => {
                              setExtraCols(prev =>
                                e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                              );
                            }}
                            style={{ accentColor: "var(--gg-primary, #2563eb)" }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {extraCols.length > 0 && (
                <button
                  onClick={() => setExtraCols([])}
                  style={{ marginTop: 12, fontSize: 12, opacity: 0.5, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {responsesLoading && (
            <div style={{ padding: 48, textAlign: "center", opacity: 0.6 }}>Loading responses…</div>
          )}

          {!responsesLoading && responsesData && (() => {
            const q = responseSearch.trim().toLowerCase();
            const filtered = q
              ? responsesData.respondents.filter((r) =>
                  [r.first_name, r.last_name, r.email, r.phone].some((v) => v?.toLowerCase().includes(q))
                )
              : responsesData.respondents;

            if (filtered.length === 0) {
              return <div style={{ padding: 48, textAlign: "center", opacity: 0.5 }}>No responses found.</div>;
            }

            const sorted = [...filtered].sort((a, b) => {
              let av = "", bv = "";
              if (sortCol === "name") {
                av = [a.last_name, a.first_name].filter(Boolean).join(" ").toLowerCase();
                bv = [b.last_name, b.first_name].filter(Boolean).join(" ").toLowerCase();
              } else if (sortCol === "email") {
                av = (a.email ?? "").toLowerCase();
                bv = (b.email ?? "").toLowerCase();
              } else if (sortCol === "phone") {
                av = a.phone ?? "";
                bv = b.phone ?? "";
              } else if (sortCol === "completed_at") {
                av = a.completed_at ?? "";
                bv = b.completed_at ?? "";
              } else if (a.personFields && sortCol in (a.personFields ?? {})) {
                av = String(a.personFields?.[sortCol] ?? "").toLowerCase();
                bv = String(b.personFields?.[sortCol] ?? "").toLowerCase();
              } else {
                av = (a.answers[sortCol] ?? "").toLowerCase();
                bv = (b.answers[sortCol] ?? "").toLowerCase();
              }
              const cmp = av < bv ? -1 : av > bv ? 1 : 0;
              return sortDir === "asc" ? cmp : -cmp;
            });

            // Pagination
            const totalCount = sorted.length;
            const totalPages = Math.ceil(totalCount / perPage);
            const safePage = Math.min(page, Math.max(0, totalPages - 1));
            const pageSlice = sorted.slice(safePage * perPage, (safePage + 1) * perPage);
            const start = safePage * perPage + 1;
            const end = Math.min((safePage + 1) * perPage, totalCount);

            const thStyle: React.CSSProperties = {
              padding: "10px 14px", textAlign: "left", fontWeight: 600,
              whiteSpace: "nowrap", borderBottom: "1px solid var(--gg-border, #e5e7eb)",
              cursor: "pointer", userSelect: "none", fontSize: 13,
            };
            const sortBtn = (col: string) => {
              const active = sortCol === col;
              return (
                <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
                  {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                </span>
              );
            };
            const onSort = (col: string) => {
              if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
              else { setSortCol(col); setSortDir("asc"); }
              setPage(0);
            };

            const btnStyle = (disabled: boolean): React.CSSProperties => ({
              padding: "5px 10px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 5,
              background: disabled ? "rgba(0,0,0,0.04)" : "transparent",
              color: disabled ? "rgba(0,0,0,0.3)" : "inherit",
              cursor: disabled ? "default" : "pointer", fontSize: 13,
            });

            const personFieldDefs = responsesData.personFieldDefs ?? [];

            return (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                        <th style={thStyle} onClick={() => onSort("name")}>Name{sortBtn("name")}</th>
                        <th style={thStyle} onClick={() => onSort("email")}>Email{sortBtn("email")}</th>
                        <th style={thStyle} onClick={() => onSort("phone")}>Phone{sortBtn("phone")}</th>
                        <th style={thStyle} onClick={() => onSort("completed_at")}>Submitted{sortBtn("completed_at")}</th>
                        {personFieldDefs.map((pf) => (
                          <th key={pf.key} style={{ ...thStyle, maxWidth: 160 }} onClick={() => onSort(pf.key)}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, overflow: "hidden", maxWidth: 150 }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pf.label}>{pf.label}</span>
                              {sortBtn(pf.key)}
                            </span>
                          </th>
                        ))}
                        {responsesData.questions.map((q) => (
                          <th key={q.id} style={{ ...thStyle, maxWidth: 180 }} onClick={() => onSort(q.id)}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, overflow: "hidden", maxWidth: 170 }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.question_text}>
                                {q.question_text}
                              </span>
                              {sortBtn(q.id)}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageSlice.map((r, i) => {
                        const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
                        return (
                          <tr key={r.person_id} style={{ borderBottom: "1px solid var(--gg-border, #e5e7eb)", background: i % 2 === 1 ? "rgba(0,0,0,0.015)" : undefined }}>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <a href={`/crm/people/${r.person_id}`} style={{ fontWeight: 600, textDecoration: "none", color: "var(--gg-primary, #2563eb)" }}>
                                {name}
                              </a>
                            </td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{r.email ?? "—"}</td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{r.phone ?? "—"}</td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap", opacity: 0.7 }}>
                              {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}
                            </td>
                            {personFieldDefs.map((pf) => (
                              <td key={pf.key} style={{ padding: "10px 14px", maxWidth: 160 }}>
                                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(r.personFields?.[pf.key] ?? "")}>
                                  {r.personFields?.[pf.key] != null ? String(r.personFields[pf.key]) : "—"}
                                </span>
                              </td>
                            ))}
                            {responsesData.questions.map((q) => (
                              <td key={q.id} style={{ padding: "10px 14px", maxWidth: 200 }}>
                                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.answers[q.id] ?? ""}>
                                  {r.answers[q.id] ?? ""}
                                </span>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination bar */}
                <div style={{ padding: "12px 16px", borderTop: "1px solid var(--gg-border, #e5e7eb)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, opacity: 0.6 }}>{start}–{end} of {totalCount.toLocaleString()}</span>
                  {totalPages > 1 && <>
                    <button style={btnStyle(safePage === 0)} disabled={safePage === 0} onClick={() => setPage(0)}>«</button>
                    <button style={btnStyle(safePage === 0)} disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                    <button style={btnStyle(safePage >= totalPages - 1)} disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button>
                    <button style={btnStyle(safePage >= totalPages - 1)} disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
                  </>}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, opacity: 0.6, marginLeft: "auto" }}>
                    Per page:
                    <select
                      value={perPage}
                      onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
                      style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 13, background: "transparent", color: "inherit" }}
                    >
                      {[25, 50, 100, 250, 500].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Summary tab ── */}
      {tab === "summary" && <>

      {/* WSPQ Nolan Chart (quiz surveys only) */}
      {stats.quizData && stats.quizData.dots.length > 0 && (
        <div style={{
          background: 'var(--gg-card, white)',
          borderRadius: 12,
          padding: 20,
          border: '1px solid var(--gg-border, #e5e7eb)'
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>Political Compass</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ background: '#0f172a', borderRadius: 12, padding: 12, display: 'inline-block' }}>
              <AggregateNolanChart dots={stats.quizData.dots} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 13, opacity: 0.6, margin: '0 0 12px' }}>
                {stats.quizData.dots.length} {stats.quizData.dots.length === 1 ? 'response' : 'responses'} plotted
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(stats.quizData.resultCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([res, count]) => {
                    const color = RESULT_COLORS[res] ?? '#64748b';
                    const pct = Math.round((count / stats.quizData!.dots.length) * 100);
                    return (
                      <div key={res}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color }}>{res.charAt(0).toUpperCase() + res.slice(1)}</span>
                          <span style={{ fontSize: 13, opacity: 0.7 }}>{count} · {pct}%</span>
                        </div>
                        <div style={{ width: '100%', height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Results */}
      {stats.questions.map((question, idx) => (
        <div key={question.question_id} style={{
          background: 'var(--gg-card, white)',
          borderRadius: 12,
          padding: 20,
          border: '1px solid var(--gg-border, #e5e7eb)'
        }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>
              Question {idx + 1}: {question.question_text}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--gg-dim)', margin: 0 }}>
              {question.total_responses} {question.total_responses === 1 ? 'response' : 'responses'}
            </p>
          </div>

          {/* ── Approval Voting ── */}
          {question.question_type === 'approval_voting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {question.answers.map((a) => {
                const total = a.count || 1;
                return (
                  <div key={a.value}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{a.value}</span>
                      <span style={{ fontSize: 12, color: 'var(--gg-dim)' }}>
                        {a.approve ?? 0} approve · {a.neutral ?? 0} neutral · {a.disapprove ?? 0} disapprove
                      </span>
                    </div>
                    <div style={{ height: 20, borderRadius: 6, overflow: 'hidden', display: 'flex', background: 'rgba(0,0,0,0.06)' }}>
                      <div style={{ width: `${(a.approvePercent ?? 0)}%`, background: '#16a34a', transition: 'width 0.5s' }} title={`Approve ${Math.round(a.approvePercent ?? 0)}%`} />
                      <div style={{ width: `${(a.neutralPercent ?? 0)}%`, background: 'rgba(100,116,139,0.5)', transition: 'width 0.5s' }} title={`Neutral ${Math.round(a.neutralPercent ?? 0)}%`} />
                      <div style={{ width: `${(a.disapprovePercent ?? 0)}%`, background: '#dc2626', transition: 'width 0.5s' }} title={`Disapprove ${Math.round(a.disapprovePercent ?? 0)}%`} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11, color: 'var(--gg-dim)' }}>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>{Math.round(a.approvePercent ?? 0)}% Approve</span>
                      <span>{Math.round(a.neutralPercent ?? 0)}% Neutral</span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{Math.round(a.disapprovePercent ?? 0)}% Disapprove</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── STAR Voting ── */}
          {question.question_type === 'star_voting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {question.answers.map((a, i) => {
                const isFinalist = question.starRunoff && (a.value === question.starRunoff.finalist1 || a.value === question.starRunoff.finalist2);
                const maxScore = question.answers[0]?.totalScore ?? 1;
                return (
                  <div key={a.value} style={{ padding: isFinalist ? '10px 12px' : '0', borderRadius: 8, border: isFinalist ? '1.5px solid rgba(217,119,6,0.4)' : 'none', background: isFinalist ? 'rgba(217,119,6,0.06)' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{a.value}</span>
                        {isFinalist && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'rgba(217,119,6,0.15)', color: '#d97706', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Finalist</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gg-dim)', fontVariantNumeric: 'tabular-nums' }}>
                        {a.totalScore ?? 0} pts · {(a.averageScore ?? 0).toFixed(1)} avg
                      </span>
                    </div>
                    <div style={{ height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(0,0,0,0.06)' }}>
                      <div style={{ width: `${maxScore > 0 ? ((a.totalScore ?? 0) / maxScore) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #d97706)', borderRadius: 5, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                      {Array.from({ length: 5 }, (_, si) => (
                        <div key={si} style={{ height: 4, flex: 1, borderRadius: 2, background: si < Math.round(a.averageScore ?? 0) ? '#f59e0b' : 'rgba(0,0,0,0.08)' }} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* STAR Runoff Result */}
              {question.starRunoff && (
                <div style={{ marginTop: 8, padding: '14px 16px', borderRadius: 10, background: 'rgba(37,99,235,0.06)', border: '1.5px solid rgba(37,99,235,0.2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--gg-dim)', marginBottom: 8 }}>STAR Runoff</div>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    <strong>{question.starRunoff.finalist1}</strong> vs <strong>{question.starRunoff.finalist2}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gg-dim)', marginBottom: 8 }}>
                    {question.starRunoff.finalist1Preferences} preferred {question.starRunoff.finalist1} &nbsp;·&nbsp;
                    {question.starRunoff.finalist2Preferences} preferred {question.starRunoff.finalist2}
                    {question.starRunoff.ties > 0 && ` · ${question.starRunoff.ties} tied`}
                  </div>
                  {question.starRunoff.winner ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: 'rgba(37,99,235,0.12)', border: '1.5px solid rgba(37,99,235,0.3)' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--gg-primary, #2563eb)' }}>Winner: {question.starRunoff.winner}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-dim)' }}>Runoff tied — no winner determined</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Location type ── */}
          {question.question_type === 'location' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {question.answers.map((answer, idx) => {
                let loc: Record<string, string> = {};
                try { loc = JSON.parse(answer.value); } catch { loc = { address_line1: answer.value }; }
                const addrLine = [loc.address_line1, [loc.city, loc.state].filter(Boolean).join(", "), loc.postal_code].filter(Boolean).join(" ");
                return (
                  <div key={idx} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--gg-border)", background: "rgba(8,145,178,0.05)" }}>
                    {loc.name && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{loc.name}</div>}
                    <div style={{ fontSize: 13, color: "var(--gg-dim)" }}>{addrLine || answer.value}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Standard types ── */}
          {question.question_type !== 'approval_voting' && question.question_type !== 'star_voting' && question.question_type !== 'location' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {question.answers.map((answer, answerIdx) => (
                <div key={`${answer.value}-${answerIdx}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{answer.value}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--gg-dim)' }}>
                        {answer.count} {answer.count === 1 ? 'vote' : 'votes'}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 48, textAlign: 'right' }}>
                        {Math.round(answer.percentage)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 12, background: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${answer.percentage}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', borderRadius: 6, transition: 'width 0.5s ease-out' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Auto-refresh indicator */}
      <div style={{ textAlign: 'center', fontSize: 13, opacity: 0.5, paddingTop: 8 }}>
        Auto-refreshing every 30 seconds
      </div>

      </>}
    </section>
  );
}