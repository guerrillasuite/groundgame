import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { normalizeCrmField } from "@/lib/db/supabase-surveys";
import { applyL2Transform, L2_BOOLEAN_COLS, L2_INTEGER_COLS, L2_SMALLINT_COLS, L2_DATE_COLS, L2_FLOAT_COLS, L2_ARRAY_COLS, L2_BIGINT_COLS } from "@/lib/crm/l2-field-map";

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

type PeopleFields = Record<string, string>;

async function findOrCreatePerson(
  sb: ReturnType<typeof makeSb>,
  tenantId: string,
  fields: PeopleFields
): Promise<string> {
  const email = fields.email?.trim();
  const phone = fields.phone?.trim() || fields.phone_cell?.trim() || fields.phone_landline?.trim();

  // 1. Email match (strong)
  if (email) {
    const { data } = await sb
      .from("people")
      .select("id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) {
      await updatePersonFields(sb, data.id, fields);
      return data.id;
    }
  }

  // 2. Phone match (strong — digits only, checks all phone columns)
  if (phone) {
    const cleaned = normalizePhone(phone);
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
        await updatePersonFields(sb, match.id, fields);
        return match.id;
      }
    }
  }

  // 3. Create new person
  const personId = crypto.randomUUID();
  const insert: Record<string, any> = {
    id: personId,
    data_source: "survey",
    data_updated_at: new Date().toISOString(),
  };
  // Copy all provided people fields — handle JSONB paths and apply type coercion
  for (const [col, val] of Object.entries(fields)) {
    if (!val?.trim()) continue;
    const dotIdx = col.indexOf(".");
    if (dotIdx >= 0) {
      // JSONB path: build nested object directly (new record, nothing to merge with)
      const jsonCol = col.slice(0, dotIdx);
      const jsonKey = col.slice(dotIdx + 1);
      insert[jsonCol] = { ...(insert[jsonCol] ?? {}), [jsonKey]: val.trim() };
    } else {
      const coerced = coercePlainValue(col, val);
      if (coerced !== null) insert[col] = coerced;
    }
  }
  await sb.from("people").insert(insert);
  await sb.from("tenant_people").insert({
    tenant_id: tenantId,
    person_id: personId,
    linked_at: new Date().toISOString(),
  });
  return personId;
}

/** Coerce a plain (non-path) column value to the correct DB type. */
function coercePlainValue(col: string, raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Delegate to applyL2Transform which handles boolean/int/smallint/date/float/array/text
  return applyL2Transform(trimmed, col);
}

async function updatePersonFields(
  sb: ReturnType<typeof makeSb>,
  personId: string,
  fields: PeopleFields
): Promise<void> {
  const patch: Record<string, any> = { data_updated_at: new Date().toISOString() };
  // JSONB path columns grouped by base column: { votes_history: { "2024_presidential_general": "Trump" } }
  const jsonbUpdates: Record<string, Record<string, any>> = {};

  for (const [col, val] of Object.entries(fields)) {
    if (!val?.trim()) continue;
    const dotIdx = col.indexOf(".");
    if (dotIdx >= 0) {
      // JSONB path: "votes_history.2024_presidential_general" → merge key into JSONB column
      const jsonCol = col.slice(0, dotIdx);
      const jsonKey = col.slice(dotIdx + 1);
      if (!jsonbUpdates[jsonCol]) jsonbUpdates[jsonCol] = {};
      jsonbUpdates[jsonCol][jsonKey] = val.trim();
    } else {
      const coerced = coercePlainValue(col, val);
      if (coerced !== null) patch[col] = coerced;
    }
  }

  // Fetch current JSONB column values, merge new keys on top, include in patch
  if (Object.keys(jsonbUpdates).length > 0) {
    const { data: currentRow } = await sb
      .from("people")
      .select(Object.keys(jsonbUpdates).join(", "))
      .eq("id", personId)
      .maybeSingle();
    for (const [jsonCol, newKeys] of Object.entries(jsonbUpdates)) {
      const current = (currentRow as any)?.[jsonCol] ?? {};
      patch[jsonCol] = { ...current, ...newKeys };
    }
  }

  if (Object.keys(patch).length > 1) {
    await sb.from("people").update(patch).eq("id", personId);
  }
}

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { survey_id, answers, delivery, contact_id, skip_stop } = body as {
    survey_id: string;
    answers: Record<string, string>;
    contact_id?: string;
    skip_stop?: boolean;
    delivery?: {
      address_line1: string;
      city?: string;
      state?: string;
      postal_code?: string;
    } | null;
  };

  if (!survey_id || !answers) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Route answers to table buckets based on crm_field mappings ────────────
  const { data: questionRows } = await sb
    .from("questions")
    .select("id, crm_field, question_type")
    .eq("survey_id", survey_id);

  const tableFields: Record<string, Record<string, string>> = {
    people: {},
    locations: {},
    households: {},
    companies: {},
    opportunities: {},
    tenant_people: {},
  };
  const productItems: Array<{ product_id: string; qty: number }> = [];
  const contactTypesToAdd: string[] = [];

  for (const q of questionRows ?? []) {
    const val = answers[q.id];
    if (!val?.trim()) continue;

    // product_picker answers → order_items later
    if (q.question_type === "product_picker") {
      try {
        const items = JSON.parse(val) as Array<{ product_id: string; qty: number }>;
        productItems.push(...items.filter((i) => i.product_id && i.qty > 0));
      } catch { /* malformed JSON — skip */ }
      continue;
    }

    if (!q.crm_field) continue;
    const { table, column } = normalizeCrmField(q.crm_field);
    // tenant_people.contact_types — collect for array append after person resolution
    if (table === "tenant_people" && column === "contact_types") {
      contactTypesToAdd.push(...val.split(",").map((v) => v.trim()).filter(Boolean));
      continue;
    }
    if (tableFields[table]) {
      tableFields[table][column] = val;
    }
  }

  // ── Find or create person ─────────────────────────────────────────────────
  let personId: string;

  if (contact_id) {
    // Caller supplied a pre-existing person UUID — verify it belongs to this tenant
    const { data: tpRow } = await sb
      .from("tenant_people")
      .select("person_id")
      .eq("tenant_id", tenant.id)
      .eq("person_id", contact_id)
      .maybeSingle();
    if (tpRow) {
      personId = contact_id;
      // Still apply any collected people field updates (e.g. from crm_field mappings)
      if (Object.values(tableFields.people).some((v) => v?.trim())) {
        await updatePersonFields(sb, personId, tableFields.people);
      }
    } else {
      // contact_id not found for this tenant — fall through to normal lookup
      personId = await findOrCreatePerson(sb, tenant.id, tableFields.people);
    }
  } else {
    const hasContact = Object.values(tableFields.people).some((v) => v?.trim());
    if (hasContact) {
      personId = await findOrCreatePerson(sb, tenant.id, tableFields.people);
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
  }

  const now = new Date().toISOString();

  // ── Fetch survey meta (title + opportunity trigger + payment flag + auto_fields) ─
  const { data: surveyRow } = await sb
    .from("surveys")
    .select("title, opp_trigger, payment_enabled, auto_fields")
    .eq("id", survey_id)
    .maybeSingle();

  // ── Apply auto pre-filled fields to table buckets ─────────────────────────
  for (const af of (surveyRow?.auto_fields as { crm_field: string; value: string }[] | null) ?? []) {
    if (!af.crm_field || !af.value?.trim()) continue;
    const { table, column } = normalizeCrmField(af.crm_field);
    // tenant_people.contact_types — collect for array append after person resolution
    if (table === "tenant_people" && column === "contact_types") {
      contactTypesToAdd.push(...af.value.split(",").map((v) => v.trim()).filter(Boolean));
      continue;
    }
    if (tableFields[table]) tableFields[table][column] = af.value.trim();
  }

  // ── Record stop in CRM activity ───────────────────────────────────────────
  if (!skip_stop) {
    await sb.from("stops").insert({
      tenant_id: tenant.id,
      person_id: personId,
      channel: "survey",
      result: "completed",
      notes: surveyRow?.title ?? survey_id,
      stop_at: now,
    });
  }

  // ── Upsert survey session ─────────────────────────────────────────────────
  await sb.from("survey_sessions").upsert(
    { crm_contact_id: personId, survey_id, started_at: now, completed_at: now, last_question_answered: null },
    { onConflict: "crm_contact_id,survey_id" }
  );

  // ── Insert responses ──────────────────────────────────────────────────────
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
      const { data: personRow } = await sb.from("people").select("first_name, last_name, email, phone, phone_cell").eq("id", personId).maybeSingle();
      const firstName = personRow?.first_name ?? "";
      const lastName  = personRow?.last_name  ?? "";
      const personName = [firstName, lastName].filter(Boolean).join(" ") || personRow?.email || "Unknown";
      const rawTitle = (trigger.title_template as string | undefined) ?? "{{last_name}} — {{date}}";
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const oppTitle = rawTitle
        .replace(/\{\{survey\}\}/g,     surveyRow?.title ?? survey_id)
        .replace(/\{\{name\}\}/g,       personName)
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{last_name\}\}/g,  lastName || "Unknown")
        .replace(/\{\{email\}\}/g,      personRow?.email ?? "")
        .replace(/\{\{phone\}\}/g,      personRow?.phone ?? personRow?.phone_cell ?? "")
        .replace(/\{\{date\}\}/g,       today)
        .replace(/\{\{channel\}\}/g,    "survey")
        .replace(/\{\{amount\}\}/g,     tableFields.opportunities?.amount_cents ? `$${(Number(tableFields.opportunities.amount_cents) / 100).toFixed(2)}` : "")
        .replace(/\{\{company\}\}/g,    tableFields.companies?.name ?? "")
        .trim().replace(/\s*—\s*$/, "").replace(/^\s*—\s*/, ""); // strip dangling dashes from empty vars

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
        pipeline: trigger.contact_type ?? null,
        contact_person_id: personId,
        source: "survey",
      }).select("id").single();
      opportunityId = (opp as any)?.id ?? null;

      // Link person into opportunity_people junction table
      if (opportunityId) {
        await sb.from("opportunity_people").upsert(
          { tenant_id: tenant.id, opportunity_id: opportunityId, person_id: personId, role: "contact", is_primary: true },
          { onConflict: "opportunity_id,person_id" }
        );
      }
    }
  }

  // ── Apply opportunity field overrides from crm_field mappings ────────────
  if (opportunityId && Object.keys(tableFields.opportunities).length > 0) {
    await sb.from("opportunities")
      .update(tableFields.opportunities)
      .eq("id", opportunityId);
  }

  // ── Update tenant_people: contact_types + other mapped fields ───────────────
  if (trigger?.enabled && trigger.contact_type && opportunityId) {
    contactTypesToAdd.push(trigger.contact_type);
  }

  const tpPlainFields = Object.entries(tableFields.tenant_people).filter(([col]) => col !== "contact_types");
  if (contactTypesToAdd.length > 0 || tpPlainFields.length > 0) {
    const selectCols = ["contact_types", ...tpPlainFields.map(([col]) => col)].join(", ");
    const { data: tpRow } = await sb
      .from("tenant_people")
      .select(selectCols)
      .eq("tenant_id", tenant.id)
      .eq("person_id", personId)
      .maybeSingle();

    const tpPatch: Record<string, any> = {};

    if (contactTypesToAdd.length > 0) {
      const existing: string[] = ((tpRow as any)?.contact_types as string[] | null) ?? [];
      tpPatch.contact_types = [...new Set([...existing, ...contactTypesToAdd])];
    }
    for (const [col, val] of tpPlainFields) {
      if (val?.trim()) tpPatch[col] = val.trim();
    }

    if (Object.keys(tpPatch).length > 0) {
      await sb
        .from("tenant_people")
        .update(tpPatch)
        .eq("tenant_id", tenant.id)
        .eq("person_id", personId);
    }
  }

  // ── Upsert delivery location if provided ─────────────────────────────────
  if (delivery?.address_line1 && opportunityId) {
    const locId = crypto.randomUUID();
    await sb.from("locations").insert({
      id: locId,
      tenant_id: tenant.id,
      address_line1: delivery.address_line1,
      city: delivery.city ?? null,
      state: delivery.state ?? null,
      postal_code: delivery.postal_code ?? null,
    });
    await sb.from("opportunity_locations").upsert({
      tenant_id: tenant.id,
      opportunity_id: opportunityId,
      location_id: locId,
      role: "delivery",
      is_primary: true,
    }, { onConflict: "tenant_id,opportunity_id,role" });
  }

  // ── Insert order_items for product_picker answers ─────────────────────────
  if (productItems.length > 0 && opportunityId) {
    await sb.from("order_items").insert(
      productItems.map((item) => ({
        tenant_id: tenant.id,
        opportunity_id: opportunityId,
        product_id: item.product_id,
        quantity: item.qty,
      }))
    );
  }

  return NextResponse.json({
    person_id: personId,
    opportunity_id: opportunityId,
    payment_required: Boolean(surveyRow?.payment_enabled),
  });
}
