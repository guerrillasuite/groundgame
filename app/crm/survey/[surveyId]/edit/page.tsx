import { redirect } from "next/navigation";

export default async function EditSurveyRedirect({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  redirect(`/crm/intake/${surveyId}/edit`);
}
