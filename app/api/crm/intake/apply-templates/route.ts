import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { INTAKE_TEMPLATES, type IntakeTemplate } from "@/lib/intake-templates";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function newId(title: string): string {
  const slug = slugify(title) || "form";
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}-${rand}`;
}

async function applyTemplate(
  sb: ReturnType<typeof makeSb>,
  tenantId: string,
  template: IntakeTemplate,
  existingTitles: Set<string>,
  existingWspqId: string | null
): Promise<{ id: string; title: string } | null> {

  // ── WSPQ special case ────────────────────────────────────────────────────
  if (template.isWspq) {
    const wspqId = `wspq-${tenantId}`;
    if (existingWspqId) return null; // already exists

    const { error: surveyErr } = await sb.from("surveys").insert({
      id: wspqId,
      public_slug: wspqId,
      tenant_id: tenantId,
      title: template.name,
      active: true,
      form_type: "survey",
      status: "draft",
      button_label: template.buttonLabel ?? null,
      show_results_after_submission: true,
      results_display_mode: "aggregate",
    });
    if (surveyErr) throw surveyErr;

    const questionRows = template.questions.map((q) => ({
      id: newId(q.question_text),
      survey_id: wspqId,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ?? null,
      display_format: q.display_format ?? null,
      crm_field: q.crm_field ?? null,
      required: q.required ?? false,
      order_index: q.order_index,
    }));
    const { error: qErr } = await sb.from("questions").insert(questionRows);
    if (qErr) throw qErr;

    return { id: wspqId, title: template.name };
  }

  // ── Standard templates ───────────────────────────────────────────────────
  if (existingTitles.has(template.name)) return null; // idempotent

  const surveyId = newId(template.name);

  const { error: surveyErr } = await sb.from("surveys").insert({
    id: surveyId,
    public_slug: surveyId,
    tenant_id: tenantId,
    title: template.name,
    active: true,
    form_type: template.type,
    status: "draft",
    button_label: template.buttonLabel ?? null,
    allow_multiple_submissions: template.allowMultiple ?? false,
    opp_trigger: template.oppTriggerOn
      ? { enabled: true, mode: "always" }
      : null,
  });
  if (surveyErr) throw surveyErr;

  if (template.questions.length > 0) {
    const questionRows = template.questions.map((q) => ({
      id: newId(q.question_text),
      survey_id: surveyId,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ?? null,
      display_format: q.display_format ?? null,
      crm_field: q.crm_field ?? null,
      required: q.required ?? false,
      order_index: q.order_index,
    }));
    const { error: qErr } = await sb.from("questions").insert(questionRows);
    if (qErr) throw qErr;
  }

  return { id: surveyId, title: template.name };
}

// POST /api/crm/intake/apply-templates
// Body: { templateIds: string[] }
// Applies the requested templates for the current tenant.
// Idempotent: skips templates whose title (or wspq ID) already exists.
export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenant();
    const body = await req.json().catch(() => ({}));
    const templateIds: string[] = Array.isArray(body.templateIds)
      ? body.templateIds
      : INTAKE_TEMPLATES.map((t) => t.id); // default: all templates

    const sb = makeSb(tenant.id);

    // Fetch existing survey titles + wspq ID
    const { data: existing } = await sb
      .from("surveys")
      .select("id, title")
      .eq("tenant_id", tenant.id);

    const existingTitles = new Set((existing ?? []).map((s: any) => s.title as string));
    const existingWspqId = (existing ?? []).find((s: any) => (s.id as string).startsWith("wspq-"))?.id ?? null;

    const created: { id: string; title: string }[] = [];
    const skipped: string[] = [];

    for (const tid of templateIds) {
      const template = INTAKE_TEMPLATES.find((t) => t.id === tid);
      if (!template) { skipped.push(tid); continue; }

      const result = await applyTemplate(sb, tenant.id, template, existingTitles, existingWspqId);
      if (result) {
        created.push(result);
        existingTitles.add(result.title); // prevent double-create within same request
      } else {
        skipped.push(tid);
      }
    }

    return NextResponse.json({ created, skipped });
  } catch (err: any) {
    console.error("[apply-templates]", err);
    return NextResponse.json({ error: err.message ?? "Failed to apply templates" }, { status: 500 });
  }
}
