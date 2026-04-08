import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/**
 * POST /api/survey/evaluate-trigger
 * Evaluates a survey's opp_trigger for an already-known contact.
 * Used by the door/dial/text PWA after KnockSurvey completion.
 *
 * Body: { survey_id, contact_id, answers: Record<string, string> }
 * Returns: { opportunity_id: string | null }
 */
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { survey_id, contact_id, answers } = body as {
    survey_id: string;
    contact_id: string;
    answers: Record<string, string>;
  };

  if (!survey_id || !contact_id) {
    return NextResponse.json({ error: "survey_id and contact_id are required" }, { status: 400 });
  }

  const { data: surveyRow } = await sb
    .from("surveys")
    .select("title, opp_trigger")
    .eq("id", survey_id)
    .maybeSingle();

  const trigger = surveyRow?.opp_trigger as Record<string, any> | null;

  let opportunityId: string | null = null;

  if (trigger?.enabled) {
    let shouldCreate = trigger.mode === "always";
    if (trigger.mode === "condition" && trigger.question_id) {
      const answerVal = String((answers ?? {})[trigger.question_id] ?? "").toLowerCase();
      const condVal = String(trigger.value ?? "").toLowerCase();
      if (trigger.operator === "equals") shouldCreate = answerVal === condVal;
      else if (trigger.operator === "not_equals") shouldCreate = answerVal !== condVal;
      else if (trigger.operator === "contains") shouldCreate = answerVal.includes(condVal);
    }

    if (shouldCreate) {
      const { data: personRow } = await sb
        .from("people")
        .select("first_name, last_name, email")
        .eq("id", contact_id)
        .maybeSingle();

      const personName =
        [personRow?.first_name, personRow?.last_name].filter(Boolean).join(" ") ||
        personRow?.email ||
        "Unknown";

      const rawTitle = (trigger.title_template as string | undefined) ?? "{{survey}} — {{name}}";
      const oppTitle = rawTitle
        .replace("{{survey}}", surveyRow?.title ?? survey_id)
        .replace("{{name}}", personName)
        .replace("{{email}}", personRow?.email ?? "");

      let stage: string = trigger.stage ?? null;
      if (!stage) {
        const stageQ = sb
          .from("opportunity_stages")
          .select("key")
          .eq("tenant_id", tenant.id)
          .order("order_index", { ascending: true })
          .limit(1);
        const { data: firstStage } = trigger.contact_type
          ? await stageQ.eq("contact_type_key", trigger.contact_type)
          : await stageQ.is("contact_type_key", null);
        stage = (firstStage as any)?.key ?? "new";
      }

      const { data: opp } = await sb
        .from("opportunities")
        .insert({
          tenant_id: tenant.id,
          title: oppTitle,
          stage,
          contact_type: trigger.contact_type ?? null,
          contact_person_id: contact_id,
          source: "survey",
        })
        .select("id")
        .single();

      opportunityId = (opp as any)?.id ?? null;
    }
  }

  return NextResponse.json({ opportunity_id: opportunityId });
}
