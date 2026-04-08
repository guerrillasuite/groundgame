import SurveyPanel from "@/app/components/survey/SurveyPanel";
import { createClient } from "@supabase/supabase-js";
import { BASE_BRANDING } from "@/lib/tenant";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function fetchSurveyByIdOrSlug(surveyId: string) {
  const sb = makeSb();
  const cols = "id, tenant_id, title, website_url, footer_text, active_channels, post_submit_survey_id";
  // Try by ID first
  let { data: survey } = await sb
    .from("surveys")
    .select(cols)
    .eq("id", surveyId)
    .eq("active", true)
    .maybeSingle();
  // Fallback: try public_slug
  if (!survey) {
    const { data: bySlug } = await sb
      .from("surveys")
      .select(cols)
      .eq("public_slug", surveyId)
      .eq("active", true)
      .maybeSingle();
    survey = bySlug;
  }
  // If survey has channel restrictions and "hosted" is not included, treat as unavailable
  if (survey) {
    const channels: string[] | null = survey.active_channels;
    if (channels && channels.length > 0 && !channels.includes("hosted")) return null;
  }
  return survey;
}

interface Props {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ kiosk?: string }>;
}

export default async function PublicSurveyPage({ params, searchParams }: Props) {
  const { surveyId } = await params;
  const { kiosk } = await searchParams;
  const sb = makeSb();

  const survey = await fetchSurveyByIdOrSlug(surveyId);

  if (!survey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f172a" }}>
        <p style={{ color: "#94a3b8" }}>Survey not available.</p>
      </div>
    );
  }

  const qCols = "id, question_text, question_type, order_index, options, display_format";

  // Fetch questions, tenant branding, post-submit questions, and hosted view config in parallel
  const [{ data: questions }, { data: tenant }, { data: postSubmitQuestions }, { data: viewConfigRow }] = await Promise.all([
    sb.from("questions").select(qCols).eq("survey_id", survey.id).order("order_index", { ascending: true }),
    sb.from("tenants").select("branding").eq("id", survey.tenant_id).maybeSingle(),
    survey.post_submit_survey_id
      ? sb.from("questions").select(qCols).eq("survey_id", survey.post_submit_survey_id).order("order_index", { ascending: true })
      : Promise.resolve({ data: null }),
    sb.from("survey_view_configs").select("pagination, page_groups").eq("survey_id", survey.id).eq("view_type", "hosted").maybeSingle(),
  ]);

  const viewConfig = viewConfigRow
    ? { pagination: viewConfigRow.pagination as string, page_groups: (viewConfigRow.page_groups ?? null) as string[][][] | null }
    : undefined;

  const branding = tenant?.branding
    ? { ...BASE_BRANDING, ...tenant.branding }
    : undefined;

  const mapQ = (q: any) => ({ ...q, question_type: q.question_type ?? "multiple_choice", display_format: q.display_format ?? null });

  return (
    <SurveyPanel
      surveyId={survey.id}
      tenantId={survey.tenant_id}
      title={survey.title}
      websiteUrl={survey.website_url ?? null}
      footerText={survey.footer_text ?? null}
      questions={(questions ?? []).map(mapQ)}
      postSubmitSurveyId={survey.post_submit_survey_id ?? null}
      postSubmitQuestions={postSubmitQuestions ? postSubmitQuestions.map(mapQ) : null}
      isKiosk={kiosk === "1"}
      branding={branding ? { primaryColor: branding.primaryColor, bgColor: branding.bgColor, textColor: branding.textColor, logoUrl: branding.logoUrl } : undefined}
      viewConfig={viewConfig}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const survey = await fetchSurveyByIdOrSlug(surveyId);
  return { title: survey?.title ?? "Survey | GroundGame" };
}
