import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import QuizPanel from "./QuizPanel";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function generateMetadata() {
  return { title: "World's Smallest Political Quiz" };
}

interface Props {
  searchParams: Promise<{ kiosk?: string }>;
}

export default async function QuizPage({ searchParams }: Props) {
  const tenant = await getTenant();
  const { kiosk } = await searchParams;
  const sb = makeSb();

  // Find the active WSPQ survey for this tenant
  const { data: survey } = await sb
    .from("surveys")
    .select("id, title, website_url, footer_text")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .ilike("id", "wspq-%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!survey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "#94a3b8", fontSize: 16 }}>Quiz not available.</p>
      </div>
    );
  }

  const { data: questions } = await sb
    .from("questions")
    .select("id, question_text, order_index")
    .eq("survey_id", survey.id)
    .order("order_index", { ascending: true });

  return (
    <QuizPanel
      surveyId={survey.id}
      tenantId={tenant.id}
      title={survey.title}
      websiteUrl={survey.website_url ?? null}
      footerText={survey.footer_text ?? null}
      questions={questions ?? []}
      isKiosk={kiosk === "1"}
    />
  );
}
