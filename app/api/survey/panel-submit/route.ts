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

async function findOrCreatePerson(
  sb: ReturnType<typeof makeSb>,
  tenantId: string,
  opts: { firstName?: string; lastName?: string; email?: string; phone?: string }
): Promise<string> {
  const { firstName, lastName, email, phone } = opts;

  // 1. Email match (strong)
  if (email?.trim()) {
    const { data } = await sb
      .from("people")
      .select("id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }

  // 2. Phone match (strong — digits only)
  if (phone?.trim()) {
    const cleaned = normalizePhone(phone.trim());
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
      if (match) return match.id;
    }
  }

  // 3. Create new person
  const personId = crypto.randomUUID();
  await sb.from("people").insert({
    id: personId,
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    email: email?.trim().toLowerCase() || null,
    phone: phone?.trim() || null,
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

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { survey_id, answers, first_name, last_name, email, phone } = body as {
    survey_id: string;
    answers: Record<string, string>;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };

  if (!survey_id || !answers) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const hasContact = first_name?.trim() || last_name?.trim() || email?.trim() || phone?.trim();
  let personId: string;

  if (hasContact) {
    personId = await findOrCreatePerson(sb, tenant.id, {
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
    });
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

  return NextResponse.json({ person_id: personId });
}
