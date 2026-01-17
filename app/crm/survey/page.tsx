// app/crm/survey/page.tsx
import Link from 'next/link';
import { getDatabase } from '@/lib/db/init';
import { ClipboardList } from 'lucide-react';

export default function SurveyPage() {
  const db = getDatabase();
  
  try {
    // Get all surveys with stats
    const surveys = db.prepare(`
      SELECT 
        s.id,
        s.title,
        s.description,
        s.active,
        s.created_at,
        COUNT(DISTINCT ss.crm_contact_id) as total_responses,
        COUNT(DISTINCT CASE WHEN ss.completed_at IS NOT NULL THEN ss.crm_contact_id END) as completed_responses
      FROM surveys s
      LEFT JOIN survey_sessions ss ON s.id = ss.survey_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all() as any[];
    
    db.close();
    
    return (
      <section className="stack">
        <div>
          <h1 style={{ margin: 0 }}>Surveys</h1>
          <p className="text-dim" style={{ marginTop: 6 }}>Manage and monitor your survey campaigns</p>
        </div>

        {surveys.length === 0 ? (
          <div style={{ 
            background: 'var(--gg-card, white)', 
            borderRadius: 12, 
            padding: 48, 
            textAlign: 'center' 
          }}>
            <div style={{ 
              margin: '0 auto 16px', 
              width: 64, 
              height: 64, 
              borderRadius: '50%', 
              background: 'rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ClipboardList size={32} style={{ opacity: 0.4 }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Surveys Yet</h3>
            <p style={{ opacity: 0.7 }}>Create your first survey to get started</p>
          </div>
        ) : (
          <div className="stack">
            {surveys.map((survey) => {
              const completionRate = survey.total_responses > 0
                ? Math.round((survey.completed_responses / survey.total_responses) * 100)
                : 0;
              
              return (
                <div key={survey.id} style={{
                  background: 'var(--gg-card, white)',
                  borderRadius: 12,
                  padding: 20,
                  border: '1px solid var(--gg-border, #e5e7eb)'
                }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{survey.title}</h2>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: survey.active ? '#dcfce7' : '#f3f4f6',
                        color: survey.active ? '#166534' : '#374151'
                      }}>
                        {survey.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {survey.description && (
                      <p style={{ opacity: 0.7, margin: '8px 0' }}>{survey.description}</p>
                    )}
                    <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
                      Created: {new Date(survey.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: 12, 
                    marginBottom: 20 
                  }}>
                    <div style={{ 
                      background: 'rgba(59, 130, 246, 0.1)', 
                      borderRadius: 8, 
                      padding: 16 
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
                        Total Started
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{survey.total_responses}</div>
                    </div>
                    <div style={{ 
                      background: 'rgba(34, 197, 94, 0.1)', 
                      borderRadius: 8, 
                      padding: 16 
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
                        Completed
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{survey.completed_responses}</div>
                    </div>
                    <div style={{ 
                      background: 'rgba(168, 85, 247, 0.1)', 
                      borderRadius: 8, 
                      padding: 16 
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
                        Completion Rate
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{completionRate}%</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <Link
                      href={`/crm/survey/${survey.id}/results`}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'var(--gg-primary, #2563eb)',
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        textAlign: 'center',
                        textDecoration: 'none',
                        display: 'block'
                      }}
                    >
                      View Results
                    </Link>
                    <Link
                      href={`/survey/${survey.id}?contact_id=PREVIEW`}
                      target="_blank"
                      style={{
                        padding: '10px 16px',
                        background: 'rgba(0,0,0,0.05)',
                        color: 'inherit',
                        borderRadius: 8,
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'block'
                      }}
                    >
                      Preview
                    </Link>
                    <a
                      href={`/api/survey/${survey.id}/export`}
                      download
                      style={{
                        padding: '10px 16px',
                        background: '#22c55e',
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'block'
                      }}
                    >
                      Export
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  } catch (error) {
    console.error('Error loading surveys:', error);
    db.close();
    
    return (
      <section className="stack">
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Error Loading Surveys</h3>
          <p style={{ opacity: 0.8 }}>Please check that the database is initialized.</p>
          <p style={{ fontSize: 13, opacity: 0.6, marginTop: 12 }}>
            Run: <code style={{ 
              background: 'rgba(0,0,0,0.05)', 
              padding: '2px 6px', 
              borderRadius: 4 
            }}>npm run db:seed</code>
          </p>
        </div>
      </section>
    );
  }
}