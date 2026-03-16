import SurveyBuilder from "@/app/components/survey/SurveyBuilder";

export default async function EditSurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  return <SurveyBuilder surveyId={surveyId} />;
}
