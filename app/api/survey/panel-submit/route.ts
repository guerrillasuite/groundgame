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

function normalizePhone(p: string) {
  return p.replace(/\D/g, "");
}

type ContactFields = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  phone_cell?: string;
  phone_landline?: string;
};

async function findOrCreatePerson(
  sb: ReturnType<typeof makeSb>,
  tenantId: string,
  opts: ContactFields
): Promise<string> {
  const { first_name, last_name, email, phone, phone_cell, phone_landline } = opts;
  const anyPhone = phone || phone_cell || phone_landline;

  // 1. Email match (strong)
  if (email?.trim()) {
    const { data } = await sb
      .from("people")
      .select("id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();
    if (data) {
      // Update the record with any new info
      await updatePersonFields(sb, data.id, opts);
      return data.id;
    }
  }

  // 2. Phone match (strong — digits only, checks all phone columns)
  if (anyPhone?.trim()) {
    const cleaned = normalizePhone(anyPhone.trim());
    if (cleaned.length >= 7) {
      const { data: candidates } = await sb
        .from("people")
        .select("id, phone, phone_cell, phone_landline, tenant_people!inner(tenant_id)")
        .eq("tenant_people.tenant_id", tenantId)
        .limit(5000);
      const match = (candidates ?? []).find((p: any) =>
        [p.phone, p.phone_cell, p.phone_landline]
          .filter(Boolean)
          .some((n: string) => normalizePhone(n) === cleaned)
      );
      if (match) {
        await updatePersonFields(sb, match.id, opts);
        return match.id;
      }
    }
  }

  // 3. Create new person
  const personId = crypto.randomUUID();
  await sb.from("people").insert({
    id: personId,
    first_name: first_name?.trim() || null,
    last_name: last_name?.trim() || null,
    email: email?.trim().toLowerCase() || null,
    phone: phone?.trim() || null,
    phone_cell: phone_cell?.trim() || null,
    phone_landline: phone_landline?.trim() || null,
    data_source: "survey",
    data_updated_at: new Date().toISOString(),
  });
  await sb.from("tenant_people").insert({
    tenant_id: tenantId,
    person_id: personId,
    linked_at: new Date().toISOString(),
  });
  return personId;
}

async function updatePersonFields(
  sb: ReturnType<typeof makeSb>,
  personId: string,
  fields: ContactFields
): Promise<void> {
  const patch: Record<string, string> = { data_updated_at: new Date().toISOString() };
  if (fields.first_name?.trim()) patch.first_name = fields.first_name.trim();
  if (fields.last_name?.trim()) patch.last_name = fields.last_name.trim();
  if (fields.email?.trim()) patch.email = fields.email.trim().toLowerCase();
  if (fields.phone?.trim()) patch.phone = fields.phone.trim();
  if (fields.phone_cell?.trim()) patch.phone_cell = fields.phone_cell.trim();
  if (fields.phone_landline?.trim()) patch.phone_landline = fields.phone_landline.trim();
  if (Object.keys(patch).length > 1) {
    await sb.from("people").update(patch).eq("id", personId);
  }
}

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { survey_id, answers } = body as {
    survey_id: string;
    answers: Record<string, string>;
  };

  if (!survey_id || !answers) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Fetch questions to extract crm_field mappings
  const { data: questionRows } = await sb
    .from("questions")
    .select("id, crm_field")
    .eq("survey_id", survey_id)
    .not("crm_field", "is", null);

  const contactFields: ContactFields = {};
  for (const q of questionRows ?? []) {
    const val = answers[q.id];
    if (val?.trim() && q.crm_field) {
      (contactFields as Record<string, string>)[q.crm_field] = val;
    }
  }

  const hasContact = Object.values(contactFields).some((v) => v?.trim());
  let personId: string;

  if (hasContact) {
    personId = await findOrCreatePerson(sb, tenant.id, contactFields);
  } else {
    // Anonymous — still create a person record to link responses
    personId = crypto.randomUUID();
    await sb.from("people").insert({
      id: personId,
      data_source: "survey",
      data_updated_at: new Date().toISOString(),
    });
    await sb.from("tenant_people").insert({
      tenant_id: tenant.id,
      person_id: personId,
      linked_at: new Date().toISOString(),
    });
  }

  const now = new Date().toISOString();

  // Fetch survey meta (title + opportunity trigger + payment flag)
  const { data: surveyRow } = await sb
    .from("surveys")
    .select("title, opp_trigger, payment_enabled")
    .eq("id", survey_id)
    .maybeSingle();

  // Record stop so this interaction appears in CRM activity
  await sb.from("stops").insert({
    tenant_id: tenant.id,
    person_id: personId,
    channel: "survey",
    result: "completed",
    notes: surveyRow?.title ?? survey_id,
    stop_at: now,
  });

  // Upsert survey session
  await sb.from("survey_sessions").upsert(
    { crm_contact_id: personId, survey_id, started_at: now, completed_at: now, last_question_answered: null },
    { onConflict: "crm_contact_id,survey_id" }
  );

  // Insert responses
  const responseRows = Object.entries(answers).map(([questionId, answerValue]) => ({
    crm_contact_id: personId,
    survey_id,
    question_id: questionId,
    answer_value: String(answerValue),
  }));
  if (responseRows.length > 0) {
    await sb.from("responses").upsert(responseRows, { onConflict: "crm_contact_id,survey_id,question_id" });
  }

  // ── Opportunity trigger ───────────────────────────────────────────────────
  let opportunityId: string | null = null;
  const trigger = surveyRow?.opp_trigger as Record<string, any> | null;
  if (trigger?.enabled) {
    let shouldCreate = trigger.mode === "always";
    if (trigger.mode === "condition" && trigger.question_id) {
      const answerVal = String(answers[trigger.question_id] ?? "").toLowerCase();
      const condVal = String(trigger.value ?? "").toLowerCase();
      if (trigger.operator === "equals") shouldCreate = answerVal === condVal;
      else if (trigger.operator === "not_equals") shouldCreate = answerVal !== condVal;
      else if (trigger.operator === "contains") shouldCreate = answerVal.includes(condVal);
    }
    if (shouldCreate) {
      // Resolve person name/email for title template
      const { data: personRow } = await sb.from("people").select("first_name, last_name, email").eq("id", personId).maybeSingle();
      const personName = [personRow?.first_name, personRow?.last_name].filter(Boolean).join(" ") || personRow?.email || "Unknown";
      const rawTitle = (trigger.title_template as string | undefined) ?? "{{survey}} — {{name}}";
      const oppTitle = rawTitle
        .replace("{{survey}}", surveyRow?.title ?? survey_id)
        .replace("{{name}}", personName)
        .replace("{{email}}", personRow?.email ?? "");

      // Resolve default stage if not set
      let stage: string = trigger.stage ?? null;
      if (!stage) {
        const stageQ = sb.from("opportunity_stages").select("key").eq("tenant_id", tenant.id).order("order_index", { ascending: true }).limit(1);
        const { data: firstStage } = trigger.contact_type
          ? await stageQ.eq("contact_type_key", trigger.contact_type)
          : await stageQ.is("contact_type_key", null);
        stage = (firstStage as any)?.key ?? "new";
      }

      const { data: opp } = await sb.from("opportunities").insert({
        tenant_id: tenant.id,
        title: oppTitle,
        stage,
        contact_type: trigger.contact_type ?? null,
        contact_person_id: personId,
        source: "survey",
      }).select("id").single();
      opportunityId = (opp as any)?.id ?? null;
    }
  }

  return NextResponse.json({
    person_id: personId,
    opportunity_id: opportunityId,
    payment_required: Boolean(surveyRow?.payment_enabled),
  });
}
