// app/components/survey/ResultsDashboard.tsx
'use client';

import { useState, useEffect } from 'react';

interface QuestionResult {
  question_id: string;
  question_text: string;
  total_responses: number;
  answers: {
    value: string;
    count: number;
    percentage: number;
  }[];
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

const RESULT_COLORS: Record<string, string> = {
  libertarian: "#eab308",
  progressive: "#3b82f6",
  conservative: "#ef4444",
  authoritarian: "#1e293b",
  moderate: "#64748b",
};

function AggregateNolanChart({ dots }: { dots: QuizDot[] }) {
  const cx = 200, cy = 200, r = 145;
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
    <svg viewBox="0 0 400 400" width={320} height={320} style={{ display: "block", maxWidth: "100%" }}
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
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

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

  useEffect(() => {
    fetchResults();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchResults, 30000);
    return () => clearInterval(interval);
  }, [surveyId]);

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

  return (
    <section className="stack" style={{ padding: 16 }}>
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
            <button
              onClick={() => handleExport('json')}
              style={{
                padding: '10px 16px',
                background: 'rgba(0,0,0,0.05)',
                color: 'inherit',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              JSON
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
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              {question.total_responses} {question.total_responses === 1 ? 'response' : 'responses'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {question.answers.map((answer, answerIdx) => (
              <div key={`${answer.value}-${answerIdx}`}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 8 
                }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {answer.value}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                      {answer.count} {answer.count === 1 ? 'vote' : 'votes'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, minWidth: 48, textAlign: 'right' }}>
                      {Math.round(answer.percentage)}%
                    </span>
                  </div>
                </div>
                <div style={{ 
                  width: '100%', 
                  height: 12, 
                  background: 'rgba(0,0,0,0.05)', 
                  borderRadius: 6, 
                  overflow: 'hidden' 
                }}>
                  <div
                    style={{
                      width: `${answer.percentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                      borderRadius: 6,
                      transition: 'width 0.5s ease-out'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Auto-refresh indicator */}
      <div style={{ textAlign: 'center', fontSize: 13, opacity: 0.5, paddingTop: 8 }}>
        Auto-refreshing every 30 seconds
      </div>
    </section>
  );
}