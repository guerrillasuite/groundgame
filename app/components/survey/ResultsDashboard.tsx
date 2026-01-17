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

interface SurveyStats {
  survey_id: string;
  survey_title: string;
  total_started: number;
  total_completed: number;
  completion_rate: number;
  questions: QuestionResult[];
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