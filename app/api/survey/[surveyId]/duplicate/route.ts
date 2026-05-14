import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  // Fetch original survey, questions, and view configs in parallel
  const [{ data: survey }, { data: questions }, { data: viewConfigs }] = await Promise.all([
    sb.from("surveys").select("*").eq("id", surveyId).maybeSingle(),
    sb.from("questions").select("*").eq("survey_id", surveyId).order("order_index", { ascending: true }),
    sb.from("survey_view_configs").select("*").eq("survey_id", surveyId),
  ]);

  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  // Generate new ID: strip any existing -copy-XXXX suffix then append new one
  const base = surveyId.replace(/-copy-[a-z0-9]+$/, "");
  const rand = Math.random().toString(36).slice(2, 6);
  const newId = `${base}-copy-${rand}`;

  // Insert duplicate survey — copy all fields, reset state
  const { error: surveyErr } = await sb.from("surveys").insert({
    id: newId,
    public_slug: newId,
    tenant_id: tenant.id,
    title: `${survey.title} (copy)`,
    description: survey.description,
    website_url: survey.website_url,
    footer_text: survey.footer_text,
    active: false,
    active_channels: [],
    form_type: survey.form_type ?? "custom",
    status: "draft", // copies always start as draft
    display_title: survey.display_title,
    display_description: survey.display_description,
    post_submit_survey_id: survey.post_submit_survey_id,
    post_submit_required: survey.post_submit_required,
    post_submit_header: survey.post_submit_header,
    thankyou_message: survey.thankyou_message,
    learn_more_label: survey.learn_more_label,
    opp_trigger: survey.opp_trigger,
    op_intake_channels: survey.op_intake_channels ?? [],
    prefill_contact: survey.prefill_contact ?? false,
    payment_enabled: survey.payment_enabled ?? false,
    storefront_mode: survey.storefront_mode,
    delivery_enabled: survey.delivery_enabled ?? false,
    order_products: survey.order_products,
    auto_fields: survey.auto_fields,
    show_share: survey.show_share ?? true,
    show_take_again: survey.show_take_again ?? true,
    button_label: survey.button_label ?? null,
    logo_display_enabled: survey.logo_display_enabled ?? true,
    staff_notification_emails: survey.staff_notification_emails ?? null,
    respondent_confirmation_email_enabled: survey.respondent_confirmation_email_enabled ?? false,
    respondent_confirmation_email_subject: survey.respondent_confirmation_email_subject ?? null,
    allow_multiple_submissions: survey.allow_multiple_submissions ?? false,
    require_contact_id_url: survey.require_contact_id_url ?? false,
    submission_limit: survey.submission_limit ?? null,
    expiration_at: null, // don't copy expiration — copy starts fresh
    password_hash: null, // don't copy password — copy starts unprotected
    show_results_after_submission: survey.show_results_after_submission ?? false,
    results_display_mode: survey.results_display_mode ?? "none",
    webhook_url: survey.webhook_url ?? null,
  });
  if (surveyErr) return NextResponse.json({ error: surveyErr.message }, { status: 500 });

  // Copy questions with new IDs — include every field
  if (questions && questions.length > 0) {
    const newQuestions = questions.map((q: any) => ({
      id: `${newId}-q${q.order_index}`,
      survey_id: newId,
      question_text: q.question_text,
      description: q.description,
      question_type: q.question_type,
      options: q.options,
      display_format: q.display_format,
      randomize_choices: q.randomize_choices ?? false,
      crm_field: q.crm_field,
      required: q.required,
      order_index: q.order_index,
      conditions: q.conditions,
    }));
    const { error: qErr } = await sb.from("questions").insert(newQuestions);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  // Copy view configs (pagination settings per view type)
  if (viewConfigs && viewConfigs.length > 0) {
    const newConfigs = viewConfigs.map((vc: any) => ({
      survey_id: newId,
      view_type: vc.view_type,
      pagination: vc.pagination,
      page_groups: vc.page_groups,
    }));
    const { error: vcErr } = await sb.from("survey_view_configs").insert(newConfigs);
    if (vcErr) return NextResponse.json({ error: vcErr.message }, { status: 500 });
  }

  return NextResponse.json({ survey_id: newId }, { status: 201 });
}
