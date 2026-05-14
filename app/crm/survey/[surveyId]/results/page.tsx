import { redirect } from "next/navigation";

export default async function SurveyResultsRedirect({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  redirect(`/crm/intake/${surveyId}/results`);
}
