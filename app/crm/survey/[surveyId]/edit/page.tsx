import SurveyBuilder from "@/app/components/survey/SurveyBuilder";
import { getTenant } from "@/lib/tenant";

export default async function EditSurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  const tenant = await getTenant();
  const hasSurveyBranding = tenant.features.includes("crm_survey_branding");
  return <SurveyBuilder surveyId={surveyId} hasSurveyBranding={hasSurveyBranding} />;
}
