/**
 * Server-side Supabase helpers for the survey system.
 * Uses the anon key (matching the rest of the app's pattern).
 * Survey tables have no RLS, so anon key has full access.
 */
import { createClient } from "@supabase/supabase-js";

function getClient(tenantId?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    tenantId ? { global: { headers: { "X-Tenant-Id": tenantId } } } : undefined
  );
}

function getServiceClient(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// For writes that don't need tenant scoping (ID-specific operations).
// Service role bypasses RLS entirely.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ActiveChannel = "embedded" | "hosted" | "doors" | "dials" | "texts" | "storefront";

export type OppTrigger = {
  enabled: boolean;
  mode: "always" | "condition";
  question_id?: string;
  operator?: "equals" | "not_equals" | "contains";
  value?: string;
  contact_type?: string | null;
  stage?: string;
  title_template?: string;
};

export type Survey = {
  id: string;
  public_slug: string | null;
  tenant_id: string;
  title: string;
  description: string | null;
  website_url: string | null;
  footer_text: string | null;
  active: boolean;
  active_channels: ActiveChannel[] | null;
  post_submit_survey_id: string | null;
  post_submit_required: boolean;
  post_submit_header: string | null;
  thankyou_message: string | null;
  learn_more_label: string | null;
  display_title: string | null;
  display_description: string | null;
  opp_trigger: OppTrigger | null;
  op_intake_channels: string[];
  payment_enabled: boolean;
  // Storefront / order form fields
  storefront_mode: "take_order" | null;
  delivery_enabled: boolean;
  order_products: string[] | null; // null = all active; array = curated product IDs
  show_share: boolean;
  show_take_again: boolean;
  created_at: string;
  updated_at: string;
};

// CrmField: namespaced "table.column" format (e.g. "people.first_name", "locations.city").
// Legacy bare values like "first_name" are treated as "people.*" for backward compat.
export type CrmField = string;

/**
 * Normalize a crm_field value to { table, column } format.
 * Legacy bare values like "first_name" map to { table: "people", column: "first_name" }.
 */
export function normalizeCrmField(raw: string): { table: string; column: string } {
  const idx = raw.indexOf(".");
  if (idx >= 0) {
    return { table: raw.slice(0, idx), column: raw.slice(idx + 1) };
  }
  return { table: "people", column: raw };
}

export type QuestionCondition = {
  show_if: {
    question_id: string;
    operator: "equals" | "not_equals" | "contains";
    value: string;
  };
} | null;

export type Question = {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: string;
  options: string[] | null; // stored as JSONB in Postgres
  display_format: "list" | "dropdown" | null;
  crm_field: CrmField | null;
  required: boolean;
  order_index: number;
  conditions: QuestionCondition;
  created_at: string;
};

export type ViewType = "embedded" | "hosted" | "door" | "call" | "text";
export type PaginationMode = "one_at_a_time" | "all_at_once" | "pages";

export type ViewConfig = {
  survey_id: string;
  view_type: ViewType;
  pagination: PaginationMode;
  // page_groups: pages × rows × questionIds. Each row has 1 or 2 question IDs (2 = side-by-side).
  page_groups: string[][][] | null;
  enabled: boolean;
};

export type SurveyWithStats = Survey & {
  total_responses: number;
  completed_responses: number;
};

// ── Survey CRUD ───────────────────────────────────────────────────────────────

export async function getSurveys(tenantId: string): Promise<SurveyWithStats[]> {
  const sb = getServiceClient(tenantId);

  // Fetch surveys
  const { data: surveys, error } = await sb
    .from("surveys")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!surveys?.length) return [];

  // Fetch session stats for all surveys
  const surveyIds = surveys.map((s) => s.id);
  const { data: sessions } = await sb
    .from("survey_sessions")
    .select("survey_id, completed_at")
    .in("survey_id", surveyIds);

  const stats = new Map<string, { total: number; completed: number }>();
  for (const sid of surveyIds) stats.set(sid, { total: 0, completed: 0 });
  for (const s of sessions ?? []) {
    const st = stats.get(s.survey_id)!;
    st.total++;
    if (s.completed_at) st.completed++;
  }

  return surveys.map((s) => ({
    ...s,
    total_responses: stats.get(s.id)?.total ?? 0,
    completed_responses: stats.get(s.id)?.completed ?? 0,
  }));
}

export async function getSurvey(
  surveyId: string,
  opts: { requireActive?: boolean } = {}
): Promise<{ survey: Survey; questions: Question[]; viewConfigs: ViewConfig[] } | null> {
  const sb = getClient();

  // Try by ID first, then fall back to public_slug
  let q = sb.from("surveys").select("*").eq("id", surveyId);
  if (opts.requireActive) q = q.eq("active", true);
  let { data: survey, error } = await q.maybeSingle();

  if (!survey) {
    // Fallback: try public_slug lookup
    let q2 = sb.from("surveys").select("*").eq("public_slug", surveyId);
    if (opts.requireActive) q2 = q2.eq("active", true);
    const { data: bySlug } = await q2.maybeSingle();
    survey = bySlug;
    error = null;
  }

  if (error || !survey) return null;

  const [{ data: questions }, { data: viewConfigs }] = await Promise.all([
    sb.from("questions").select("*").eq("survey_id", survey.id).order("order_index", { ascending: true }),
    sb.from("survey_view_configs").select("*").eq("survey_id", survey.id),
  ]);

  return { survey, questions: questions ?? [], viewConfigs: viewConfigs ?? [] };
}

export async function createSurvey(params: {
  id: string;
  title: string;
  description?: string;
  tenantId: string;
}): Promise<void> {
  const sb = getServiceClient(params.tenantId);
  const { error } = await sb.from("surveys").insert({
    id: params.id,
    public_slug: params.id, // default public_slug = id
    tenant_id: params.tenantId,
    title: params.title,
    description: params.description ?? null,
    active: true,
  });
  if (error) throw error;
}

export async function updateSurvey(
  surveyId: string,
  params: {
    title: string;
    description?: string;
    website_url?: string;
    footer_text?: string;
    active_channels: ActiveChannel[];
    public_slug?: string;
    post_submit_survey_id?: string | null;
    post_submit_required?: boolean;
    post_submit_header?: string | null;
    thankyou_message?: string | null;
    learn_more_label?: string | null;
    display_title?: string | null;
    display_description?: string | null;
    opp_trigger?: OppTrigger | null;
    op_intake_channels?: string[];
    prefill_contact?: boolean;
    payment_enabled?: boolean;
    storefront_mode?: "take_order" | null;
    delivery_enabled?: boolean;
    order_products?: string[] | null;
    auto_fields?: { crm_field: string; value: string }[] | null;
    show_share?: boolean;
    show_take_again?: boolean;
  }
): Promise<void> {
  const sb = getAdminClient();
  const update: Record<string, unknown> = {
    title: params.title,
    description: params.description ?? null,
    website_url: params.website_url ?? null,
    footer_text: params.footer_text ?? null,
    active_channels: params.active_channels,
    // Derive legacy `active` from channels for backward compat (e.g. crm dashboard query)
    active: params.active_channels.length > 0,
    updated_at: new Date().toISOString(),
  };
  if (params.public_slug !== undefined) update.public_slug = params.public_slug || null;
  if ("post_submit_survey_id" in params) update.post_submit_survey_id = params.post_submit_survey_id ?? null;
  if ("post_submit_required" in params) update.post_submit_required = params.post_submit_required ?? false;
  if ("post_submit_header" in params) update.post_submit_header = params.post_submit_header || null;
  if ("thankyou_message" in params) update.thankyou_message = params.thankyou_message || null;
  if ("learn_more_label" in params) update.learn_more_label = params.learn_more_label || null;
  if ("display_title" in params) update.display_title = params.display_title || null;
  if ("display_description" in params) update.display_description = params.display_description || null;
  if ("opp_trigger" in params) update.opp_trigger = params.opp_trigger ?? null;
  if ("op_intake_channels" in params) update.op_intake_channels = params.op_intake_channels ?? [];
  if ("prefill_contact" in params) update.prefill_contact = params.prefill_contact ?? false;
  if ("payment_enabled" in params) update.payment_enabled = params.payment_enabled ?? false;
  if ("storefront_mode" in params) update.storefront_mode = params.storefront_mode ?? null;
  if ("delivery_enabled" in params) update.delivery_enabled = params.delivery_enabled ?? false;
  if ("order_products" in params) update.order_products = params.order_products ?? null;
  if ("auto_fields" in params) update.auto_fields = params.auto_fields?.length ? params.auto_fields : null;
  if ("show_share" in params) update.show_share = params.show_share ?? true;
  if ("show_take_again" in params) update.show_take_again = params.show_take_again ?? true;
  const { error } = await sb.from("surveys").update(update).eq("id", surveyId);
  if (error) throw error;
}

export async function deleteSurvey(surveyId: string): Promise<void> {
  const sb = getAdminClient();
  const { error } = await sb.from("surveys").delete().eq("id", surveyId);
  if (error) throw error;
}

// ── Question CRUD ─────────────────────────────────────────────────────────────

export async function createQuestion(
  surveyId: string,
  params: {
    id: string;
    question_text: string;
    description?: string | null;
    question_type: string;
    options: string[] | null;
    display_format?: "list" | "dropdown" | null;
    randomize_choices?: boolean;
    crm_field?: CrmField | null;
    required: boolean;
    order_index: number;
    conditions?: QuestionCondition;
  }
): Promise<void> {
  const sb = getAdminClient();
  const { error } = await sb.from("questions").insert({
    id: params.id,
    survey_id: surveyId,
    question_text: params.question_text,
    description: params.description ?? null,
    question_type: params.question_type,
    options: params.options?.length ? params.options : null,
    display_format: params.display_format ?? null,
    randomize_choices: params.randomize_choices ?? false,
    crm_field: params.crm_field ?? null,
    required: params.required,
    order_index: params.order_index,
    conditions: params.conditions ?? null,
  });
  if (error) throw error;
}

export async function updateQuestion(
  questionId: string,
  params: {
    question_text: string;
    description?: string | null;
    question_type: string;
    options: string[] | null;
    display_format?: "list" | "dropdown" | null;
    randomize_choices?: boolean;
    crm_field?: CrmField | null;
    required: boolean;
    order_index: number;
    conditions?: QuestionCondition;
  }
): Promise<void> {
  const sb = getAdminClient();
  const { error } = await sb
    .from("questions")
    .update({
      question_text: params.question_text,
      description: params.description ?? null,
      question_type: params.question_type,
      options: params.options?.length ? params.options : null,
      display_format: params.display_format ?? null,
      randomize_choices: params.randomize_choices ?? false,
      crm_field: params.crm_field ?? null,
      required: params.required,
      order_index: params.order_index,
      conditions: params.conditions ?? null,
    })
    .eq("id", questionId);
  if (error) throw error;
}

export async function deleteQuestion(
  questionId: string,
  surveyId: string
): Promise<void> {
  const sb = getAdminClient();
  await sb.from("questions").delete().eq("id", questionId).eq("survey_id", surveyId);

  // Renumber remaining questions
  const { data: remaining } = await sb
    .from("questions")
    .select("id")
    .eq("survey_id", surveyId)
    .order("order_index", { ascending: true });

  if (remaining?.length) {
    await Promise.all(
      remaining.map((q, i) =>
        sb.from("questions").update({ order_index: i + 1 }).eq("id", q.id)
      )
    );
  }
}

// ── Responses ─────────────────────────────────────────────────────────────────

export async function saveResponse(params: {
  crm_contact_id: string;
  survey_id: string;
  question_id: string;
  answer_value: string;
  answer_text?: string | null;
}): Promise<void> {
  const sb = getClient();

  // Upsert response (one answer per contact per question)
  const { data: existing } = await sb
    .from("responses")
    .select("id")
    .eq("crm_contact_id", params.crm_contact_id)
    .eq("question_id", params.question_id)
    .maybeSingle();

  if (existing) {
    await sb
      .from("responses")
      .update({
        answer_value: params.answer_value,
        answer_text: params.answer_text ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await sb.from("responses").insert({
      crm_contact_id: params.crm_contact_id,
      survey_id: params.survey_id,
      question_id: params.question_id,
      answer_value: params.answer_value,
      answer_text: params.answer_text ?? null,
    });
  }

  // Upsert session tracking
  const { data: session } = await sb
    .from("survey_sessions")
    .select("id")
    .eq("crm_contact_id", params.crm_contact_id)
    .eq("survey_id", params.survey_id)
    .maybeSingle();

  if (session) {
    await sb
      .from("survey_sessions")
      .update({ last_question_answered: params.question_id })
      .eq("id", session.id);
  } else {
    await sb.from("survey_sessions").insert({
      crm_contact_id: params.crm_contact_id,
      survey_id: params.survey_id,
      last_question_answered: params.question_id,
    });
  }
}

export async function completeSession(params: {
  crm_contact_id: string;
  survey_id: string;
}): Promise<void> {
  const sb = getClient();
  await sb
    .from("survey_sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("crm_contact_id", params.crm_contact_id)
    .eq("survey_id", params.survey_id)
    .is("completed_at", null);
}

// ── Results ───────────────────────────────────────────────────────────────────

export async function getSurveyResults(surveyId: string, tenantId: string) {
  const sb = getServiceClient(tenantId);

  const [
    { data: survey },
    { data: sessions },
    { data: questions },
    { data: responses },
  ] = await Promise.all([
    sb.from("surveys").select("id, title, description").eq("id", surveyId).single(),
    sb.from("survey_sessions").select("completed_at").eq("survey_id", surveyId),
    sb.from("questions").select("id, question_text, question_type, order_index").eq("survey_id", surveyId).order("order_index"),
    sb.from("responses").select("question_id, answer_value, answer_text").eq("survey_id", surveyId),
  ]);

  if (!survey) return null;

  const totalStarted = sessions?.length ?? 0;
  const totalCompleted = sessions?.filter((s) => s.completed_at).length ?? 0;

  const MULTI_SELECT_TYPES = new Set(["multiple_select", "multiple_select_with_other"]);

  const questionResults = (questions ?? []).map((q) => {
    const qResponses = (responses ?? []).filter((r) => r.question_id === q.id);
    const total = qResponses.length;
    const isMultiSelect = MULTI_SELECT_TYPES.has(q.question_type);
    const counts = new Map<string, number>();

    for (const r of qResponses) {
      if (isMultiSelect) {
        // answer_value is a JSON array e.g. '["Option A","Option B"]'
        let vals: string[] = [];
        try { vals = JSON.parse(r.answer_value); } catch { vals = [r.answer_value]; }
        for (const v of vals) {
          const key = v === "other" && r.answer_text ? `Other: ${r.answer_text}` : v;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      } else {
        const key =
          r.answer_value === "other" && r.answer_text
            ? `Other: ${r.answer_text}`
            : r.answer_value;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const answers = Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        // For multi-select, percentage is out of total respondents (not total selections)
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      question_id: q.id,
      question_text: q.question_text,
      total_responses: total,
      answers,
    };
  });

  // For WSPQ surveys fetch stops so the dashboard can render the aggregate Nolan Chart
  let quizData: { dots: { personalScore: number; economicScore: number; result: string }[]; resultCounts: Record<string, number> } | undefined;
  if (surveyId.startsWith("wspq-")) {
    const { data: stops } = await sb
      .from("stops")
      .select("result, notes")
      .eq("tenant_id", tenantId)
      .eq("channel", "quiz");

    const scoreRx = /Personal:\s*(\d+)\/100\s*·\s*Economic:\s*(\d+)\/100/;
    const dots = (stops ?? []).flatMap((s: { result: string | null; notes: string | null }) => {
      const m = s.notes?.match(scoreRx);
      if (!m) return [];
      return [{ personalScore: parseInt(m[1]), economicScore: parseInt(m[2]), result: s.result ?? "moderate" }];
    });
    const resultCounts: Record<string, number> = {};
    for (const d of dots) resultCounts[d.result] = (resultCounts[d.result] ?? 0) + 1;
    quizData = { dots, resultCounts };
  }

  return {
    survey_id: survey.id,
    survey_title: survey.title,
    total_started: totalStarted,
    total_completed: totalCompleted,
    completion_rate: totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0,
    questions: questionResults,
    quizData,
  };
}

// ── View configs ─────────────────────────────────────────────────────────────

export async function getViewConfigs(surveyId: string): Promise<ViewConfig[]> {
  const sb = getAdminClient();
  const { data } = await sb.from("survey_view_configs").select("*").eq("survey_id", surveyId);
  return data ?? [];
}

export async function upsertViewConfigs(
  surveyId: string,
  configs: Array<{ view_type: ViewType; pagination: PaginationMode; page_groups?: string[][][] | null }>
): Promise<void> {
  const sb = getAdminClient();
  for (const cfg of configs) {
    await sb.from("survey_view_configs").upsert({
      survey_id: surveyId,
      view_type: cfg.view_type,
      pagination: cfg.pagination,
      page_groups: cfg.page_groups ?? null,
      enabled: true,
    }, { onConflict: "survey_id,view_type" });
  }
}

// ── User assignments ──────────────────────────────────────────────────────────

export async function getUserAssignments(surveyId: string): Promise<string[]> {
  const sb = getAdminClient();
  const { data } = await sb.from("survey_user_assignments").select("user_id").eq("survey_id", surveyId);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

export async function syncUserAssignments(surveyId: string, userIds: string[]): Promise<void> {
  const sb = getAdminClient();
  // Delete existing, re-insert desired list
  await sb.from("survey_user_assignments").delete().eq("survey_id", surveyId);
  if (userIds.length > 0) {
    await sb.from("survey_user_assignments").insert(
      userIds.map((uid) => ({ survey_id: surveyId, user_id: uid }))
    );
  }
}

// ── Walklist ↔ Survey linking ─────────────────────────────────────────────────

/** Returns a map of survey_id → list of {id, name} walklists assigned to it */
export async function getWalklistsBySurvey(
  tenantId: string
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const sb = getServiceClient(tenantId);
  const { data } = await sb
    .from("walklists")
    .select("id, name, survey_id")
    .eq("tenant_id", tenantId)
    .not("survey_id", "is", null);

  const map = new Map<string, Array<{ id: string; name: string }>>();
  for (const wl of data ?? []) {
    if (!wl.survey_id) continue;
    const arr = map.get(wl.survey_id) ?? [];
    arr.push({ id: wl.id, name: wl.name ?? "(Untitled)" });
    map.set(wl.survey_id, arr);
  }
  return map;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function getSurveyExportData(surveyId: string, tenantId: string) {
  const sb = getServiceClient(tenantId);

  // Fetch survey (including post_submit_survey_id)
  const { data: survey } = await sb
    .from("surveys")
    .select("id, title, description, created_at, post_submit_survey_id")
    .eq("id", surveyId)
    .single();

  if (!survey) return null;

  const [
    { data: sessions },
    { data: questions },
    { data: responses },
  ] = await Promise.all([
    sb.from("survey_sessions").select("*").eq("survey_id", surveyId),
    sb.from("questions").select("*").eq("survey_id", surveyId).order("order_index"),
    sb
      .from("responses")
      .select("crm_contact_id, question_id, answer_value, answer_text, created_at")
      .eq("survey_id", surveyId),
  ]);

  // Fetch post-submit survey questions + responses if linked
  let postSubmitQuestions: any[] = [];
  let postSubmitResponses: any[] = [];
  if (survey.post_submit_survey_id) {
    const [{ data: psQs }, { data: psRs }] = await Promise.all([
      sb.from("questions").select("*").eq("survey_id", survey.post_submit_survey_id).order("order_index"),
      sb.from("responses")
        .select("crm_contact_id, question_id, answer_value, answer_text, created_at")
        .eq("survey_id", survey.post_submit_survey_id),
    ]);
    postSubmitQuestions = psQs ?? [];
    postSubmitResponses = psRs ?? [];
  }

  // Collect all unique person IDs across both surveys
  const allPersonIds = [...new Set([
    ...(responses ?? []).map((r: any) => r.crm_contact_id),
    ...postSubmitResponses.map((r: any) => r.crm_contact_id),
  ].filter(Boolean))];

  // Fetch contact info from people table
  const contactMap = new Map<string, { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; id: string }>();
  if (allPersonIds.length > 0) {
    const { data: people } = await sb
      .from("people")
      .select("id, first_name, last_name, email, phone")
      .in("id", allPersonIds);
    for (const p of people ?? []) contactMap.set(p.id, p);
  }

  return {
    survey,
    sessions: sessions ?? [],
    questions: questions ?? [],
    responses: responses ?? [],
    postSubmitQuestions,
    postSubmitResponses,
    contactMap,
  };
}
