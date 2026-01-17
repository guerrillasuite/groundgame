// app/crm/survey/[surveyId]/results/page.tsx
import { ResultsDashboard } from '@/app/components/survey/ResultsDashboard';

export default function SurveyResultsPage({ 
  params 
}: { 
  params: { surveyId: string } 
}) {
  return <ResultsDashboard surveyId={params.surveyId} />;
}