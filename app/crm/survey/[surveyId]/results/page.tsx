// app/crm/survey/[surveyId]/results/page.tsx
import { Suspense } from 'react';
import { ResultsDashboard } from '@/app/components/survey/ResultsDashboard';

export default async function SurveyResultsPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  return (
    <Suspense>
      <ResultsDashboard surveyId={surveyId} />
    </Suspense>
  );
}