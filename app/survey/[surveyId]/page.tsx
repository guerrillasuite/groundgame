import SurveyPanel from "@/app/components/survey/SurveyPanel";
import { createClient } from "@supabase/supabase-js";
import { BASE_BRANDING } from "@/lib/tenant";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface Props {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ contact_id?: string; kiosk?: string }>;
}

export default async function SurveyPage({ params, searchParams }: Props) {
  const { surveyId } = await params;
  const { contact_id, kiosk } = await searchParams;

  // Require contact_id to proceed
  if (!contact_id) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "rgb(var(--bg-900))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}>
        <div style={{
          maxWidth: "500px", width: "100%",
          background: "rgb(var(--surface-800))",
          borderRadius: "16px", padding: "32px",
          border: "1px solid rgb(var(--border-600))",
          textAlign: "center",
        }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 700, color: "rgb(var(--text-100))" }}>
            Access Denied
          </h2>
          <p style={{ margin: 0, color: "rgb(var(--text-300))", fontSize: "16px" }}>
            This survey requires a valid access link. Please use the link provided to you.
          </p>
        </div>
      </div>
    );
  }

  const sb = makeSb();
  const qCols = "id, question_text, description, question_type, order_index, options, display_format, randomize_choices, crm_field, required, conditions";

  // Fetch everything in parallel
  const [
    { data: survey },
    { data: questions },
    { data: contactRow },
  ] = await Promise.all([
    sb.from("surveys")
      .select("id, tenant_id, title, display_title, display_description, website_url, footer_text, active_channels, post_submit_survey_id, post_submit_required, post_submit_header, thankyou_message, learn_more_label, prefill_contact, payment_enabled, delivery_enabled, order_products, opp_trigger, auto_fields")
      .eq("id", surveyId)
      .eq("active", true)
      .maybeSingle(),
    sb.from("questions")
      .select(qCols)
      .eq("survey_id", surveyId)
      .order("order_index", { ascending: true }),
    sb.from("people")
      .select("first_name, last_name, email, phone, votes_history, top_issues")
      .eq("id", contact_id)
      .maybeSingle(),
  ]);

  if (!survey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "rgb(var(--bg-900))" }}>
        <p style={{ color: "rgb(var(--text-300))" }}>Survey not available.</p>
      </div>
    );
  }

  // Fetch tenant branding, post-submit questions, view config, and optionally tenant_people in parallel
  const [{ data: tenant }, { data: postSubmitQuestions }, { data: viewConfigRow }, tpRow] = await Promise.all([
    sb.from("tenants").select("branding").eq("id", survey.tenant_id).maybeSingle(),
    survey.post_submit_survey_id
      ? sb.from("questions").select(qCols).eq("survey_id", survey.post_submit_survey_id).order("order_index", { ascending: true })
      : Promise.resolve({ data: null }),
    sb.from("survey_view_configs")
      .select("pagination, page_groups")
      .eq("survey_id", survey.id)
      .eq("view_type", "door")
      .maybeSingle(),
    (survey.prefill_contact && contact_id)
      ? sb.from("tenant_people").select("notes, priority, volunteer_status, source, delegation_state").eq("person_id", contact_id).eq("tenant_id", survey.tenant_id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
  ]);

  const branding = tenant?.branding ? { ...BASE_BRANDING, ...tenant.branding } : undefined;
  const viewConfig = viewConfigRow
    ? { pagination: viewConfigRow.pagination as string, page_groups: (viewConfigRow.page_groups ?? null) as string[][][] | null }
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
        const jsonObj = (sourceRow as any)[baseCol];
        if (jsonObj && typeof jsonObj === "object") val = jsonObj[jsonKey] ?? undefined;
      } else {
        const raw = (sourceRow as any)[colPath];
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
    <>
      <SurveyPanel
        surveyId={survey.id}
        tenantId={survey.tenant_id}
        title={survey.display_title ?? survey.title}
        websiteUrl={survey.website_url ?? null}
        learnMoreLabel={survey.learn_more_label ?? null}
        footerText={survey.footer_text ?? null}
        questions={(questions ?? []).map(mapQ)}
        postSubmitSurveyId={survey.post_submit_survey_id ?? null}
        postSubmitQuestions={postSubmitQuestions ? postSubmitQuestions.map(mapQ) : null}
        postSubmitRequired={Boolean(survey.post_submit_required)}
        postSubmitHeader={survey.post_submit_header ?? null}
        thankyouMessage={survey.thankyou_message ?? null}
        displayDescription={survey.display_description ?? null}
        isKiosk={kiosk === "1"}
        contactId={contact_id}
        initialAnswers={Object.keys(initialAnswers).length > 0 ? initialAnswers : undefined}
        initialPostSubmitAnswers={Object.keys(initialPostSubmitAnswers).length > 0 ? initialPostSubmitAnswers : undefined}
        branding={branding ? { primaryColor: branding.primaryColor, bgColor: branding.bgColor, textColor: branding.textColor, logoUrl: branding.logoUrl } : undefined}
        viewConfig={viewConfig}
        deliveryEnabled={Boolean(survey.delivery_enabled)}
        orderProducts={Array.isArray(survey.order_products) ? survey.order_products : null}
      />

      {/* Financial Disclosure */}
      <div style={{
        textAlign: "center",
        padding: "24px 16px",
        color: "rgb(var(--text-300))",
        fontSize: "12px",
        background: "rgb(var(--bg-900))",
      }}>
        Paid for by the Libertarian Booster PAC
      </div>
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const sb = makeSb();
  const { data: survey } = await sb.from("surveys").select("title").eq("id", surveyId).maybeSingle();
  return { title: survey?.title ?? "Survey | GroundGame" };
}
