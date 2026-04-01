import SurveyPanel from "@/app/components/survey/SurveyPanel";
import { createClient } from "@supabase/supabase-js";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface Props {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ kiosk?: string }>;
}

export default async function PublicSurveyPage({ params, searchParams }: Props) {
  const { surveyId } = await params;
  const { kiosk } = await searchParams;
  const sb = makeSb();

  const { data: survey } = await sb
    .from("surveys")
    .select("id, tenant_id, title, website_url, footer_text")
    .eq("id", surveyId)
    .eq("active", true)
    .maybeSingle();

  if (!survey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f172a" }}>
        <p style={{ color: "#94a3b8" }}>Survey not available.</p>
      </div>
    );
  }

  const { data: questions } = await sb
    .from("questions")
    .select("id, question_text, order_index, options")
    .eq("survey_id", surveyId)
    .order("order_index", { ascending: true });

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <SurveyPanel
        surveyId={survey.id}
        tenantId={survey.tenant_id}
        title={survey.title}
        websiteUrl={survey.website_url ?? null}
        footerText={survey.footer_text ?? null}
        questions={questions ?? []}
        isKiosk={kiosk === "1"}
      />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ surveyId: string }> }) {
  return {
    title: "Survey | GroundGame",
    description: "Complete your survey",
  };
}
