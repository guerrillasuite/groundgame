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
  const cols = "id, tenant_id, title, display_title, display_description, website_url, footer_text, active_channels, post_submit_survey_id, post_submit_required, post_submit_header, thankyou_message, learn_more_label, prefill_contact";
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
  searchParams: Promise<{ kiosk?: string; contact_id?: string }>;
}

export default async function PublicSurveyPage({ params, searchParams }: Props) {
  const { surveyId } = await params;
  const { kiosk, contact_id } = await searchParams;
  const sb = makeSb();

  const survey = await fetchSurveyByIdOrSlug(surveyId);

  if (!survey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f172a" }}>
        <p style={{ color: "#94a3b8" }}>Survey not available.</p>
      </div>
    );
  }

  const qCols = "id, question_text, description, question_type, order_index, options, display_format, randomize_choices, crm_field, required, conditions";

  // Fetch questions, tenant branding, post-submit questions, hosted view config, and optionally contact info
  const [{ data: questions }, { data: tenant }, { data: postSubmitQuestions }, { data: viewConfigRow }, contactRow, tpRow] = await Promise.all([
    sb.from("questions").select(qCols).eq("survey_id", survey.id).order("order_index", { ascending: true }),
    sb.from("tenants").select("branding").eq("id", survey.tenant_id).maybeSingle(),
    survey.post_submit_survey_id
      ? sb.from("questions").select(qCols).eq("survey_id", survey.post_submit_survey_id).order("order_index", { ascending: true })
      : Promise.resolve({ data: null }),
    sb.from("survey_view_configs").select("pagination, page_groups").eq("survey_id", survey.id).eq("view_type", "hosted").maybeSingle(),
    (survey.prefill_contact && contact_id)
      ? sb.from("people").select("first_name, last_name, email, phone, votes_history, top_issues").eq("id", contact_id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
    (survey.prefill_contact && contact_id)
      ? sb.from("tenant_people").select("notes, priority, volunteer_status, source, delegation_state").eq("person_id", contact_id).eq("tenant_id", survey.tenant_id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
  ]);

  const viewConfig = viewConfigRow
    ? { pagination: viewConfigRow.pagination as string, page_groups: (viewConfigRow.page_groups ?? null) as string[][][] | null }
    : undefined;

  const branding = tenant?.branding
    ? { ...BASE_BRANDING, ...tenant.branding }
    : undefined;

  const mapQ = (q: any) => ({
    ...q,
    question_type: q.question_type ?? "multiple_choice",
    display_format: q.display_format ?? null,
    description: q.description ?? null,
    randomize_choices: Boolean(q.randomize_choices),
    conditions: q.conditions ?? null,
  });

  // Build pre-filled answers from contact info if prefill_contact is enabled.
  // Supports people.* and tenant_people.* fields.
  function buildPrefill(qs: any[], peopleRow: any, tpRow: any): Record<string, string> {
    const out: Record<string, string> = {};
    for (const q of qs) {
      if (!q.crm_field) continue;
      const crm = q.crm_field as string;
      const dotIdx = crm.indexOf(".");
      if (dotIdx < 0) continue;
      const table = crm.slice(0, dotIdx);
      const colPath = crm.slice(dotIdx + 1);
      const sourceRow = table === "people" ? peopleRow : table === "tenant_people" ? tpRow : null;
      if (!sourceRow) continue;
      const subDot = colPath.indexOf(".");
      let val: string | undefined;
      if (subDot >= 0) {
        const baseCol = colPath.slice(0, subDot);
        const jsonKey = colPath.slice(subDot + 1);
        const jsonObj = sourceRow[baseCol];
        if (jsonObj && typeof jsonObj === "object") val = jsonObj[jsonKey] ?? undefined;
      } else {
        const raw = sourceRow[colPath];
        if (Array.isArray(raw)) {
          val = raw.length > 0 ? JSON.stringify(raw) : undefined;
        } else if (raw != null && raw !== "") {
          val = String(raw);
        }
      }
      if (val) out[q.id] = val;
    }
    return out;
  }

  const initialAnswers = (survey.prefill_contact && contactRow)
    ? buildPrefill(questions ?? [], contactRow, tpRow) : {};
  const initialPostSubmitAnswers = (survey.prefill_contact && contactRow && postSubmitQuestions)
    ? buildPrefill(postSubmitQuestions, contactRow, tpRow) : {};

  return (
    <SurveyPanel
      surveyId={survey.id}
      tenantId={survey.tenant_id}
      title={survey.display_title ?? survey.title}
      displayDescription={survey.display_description ?? null}
      websiteUrl={survey.website_url ?? null}
      learnMoreLabel={survey.learn_more_label ?? null}
      footerText={survey.footer_text ?? null}
      postSubmitHeader={survey.post_submit_header ?? null}
      thankyouMessage={survey.thankyou_message ?? null}
      questions={(questions ?? []).map(mapQ)}
      postSubmitSurveyId={survey.post_submit_survey_id ?? null}
      postSubmitQuestions={postSubmitQuestions ? postSubmitQuestions.map(mapQ) : null}
      postSubmitRequired={Boolean(survey.post_submit_required)}
      isKiosk={kiosk === "1"}
      contactId={contact_id ?? null}
      initialAnswers={Object.keys(initialAnswers).length > 0 ? initialAnswers : undefined}
      initialPostSubmitAnswers={Object.keys(initialPostSubmitAnswers).length > 0 ? initialPostSubmitAnswers : undefined}
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
