// app/survey/[surveyId]/page.tsx
import { SurveyContainer } from '@/app/components/survey/SurveyContainer';

interface SurveyPageProps {
  params: { surveyId: string };
  searchParams: { contact_id?: string };
}

export default function SurveyPage({ params, searchParams }: SurveyPageProps) {
  const { surveyId } = params;
  const { contact_id } = searchParams;
  
  // Require contact_id to proceed
  if (!contact_id) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'rgb(var(--bg-900))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)',
          textAlign: 'center'
        }}>
          <h2 style={{
            margin: '0 0 8px',
            fontSize: '24px',
            fontWeight: 700,
            color: 'rgb(var(--text-100))'
          }}>
            Access Denied
          </h2>
          <p style={{
            margin: 0,
            color: 'rgb(var(--text-300))',
            fontSize: '16px'
          }}>
            This survey requires a valid access link. Please use the link provided to you.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <SurveyContainer 
        surveyId={surveyId} 
        contactId={contact_id}
        randomizeOptions={true}
      />
      
      {/* Financial Disclosure */}
      <div style={{
        textAlign: 'center',
        padding: '24px 16px',
        color: 'rgb(var(--text-300))',
        fontSize: '12px',
        background: 'rgb(var(--bg-900))'
      }}>
        Paid for by the Libertarian Booster PAC
      </div>
    </>
  );
}

// Optional: Add metadata
export async function generateMetadata({ params }: { params: { surveyId: string } }) {
  return {
    title: 'Survey | GroundGame',
    description: 'Complete your survey'
  };
}