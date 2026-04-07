import SurveyBuilder from "@/app/components/survey/SurveyBuilder";
import { getTenant } from "@/lib/tenant";

export default async function NewSurveyPage() {
  const tenant = await getTenant();
  const hasSurveyBranding = tenant.features.includes("crm_survey_branding");
  return <SurveyBuilder hasSurveyBranding={hasSurveyBranding} />;
}
