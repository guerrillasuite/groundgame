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

function generateId() {
  return crypto.randomUUID();
}

// ── Person deduplication ───────────────────────────────────────────────────────
// Returns: { personId, isNew, reviewNeeded }
async function findOrCreatePerson(
  sb: ReturnType<typeof makeSb>,
  tenantId: string,
  opts: { firstName?: string; lastName?: string; email?: string; phone?: string }
): Promise<{ personId: string; isNew: boolean; reviewNeeded: boolean }> {
  const { firstName, lastName, email, phone } = opts;
  const hasAnyField = firstName?.trim() || lastName?.trim() || email?.trim() || phone?.trim();
  if (!hasAnyField) {
    // No contact info — create anonymous person
    const personId = generateId();
    await sb.from("people").insert({ id: personId, data_source: "quiz", data_updated_at: new Date().toISOString() });
    await sb.from("tenant_people").insert({ tenant_id: tenantId, person_id: personId, linked_at: new Date().toISOString() });
    return { personId, isNew: true, reviewNeeded: false };
  }

  // 1. Email exact match (strong)
  if (email?.trim()) {
    const { data } = await sb
      .from("people")
      .select("id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();
    if (data) {
      // Update phone if we have it and it's missing
      if (phone?.trim()) {
        const normalized = normalizePhone(phone.trim());
        const { data: existing } = await sb.from("people").select("phone").eq("id", data.id).maybeSingle();
        if (!existing?.phone && normalized) {
          await sb.from("people").update({ phone: phone.trim() }).eq("id", data.id);
        }
      }
      return { personId: data.id, isNew: false, reviewNeeded: false };
    }
  }

  // 2. Phone match (strong — digits only)
  if (phone?.trim()) {
    const cleaned = normalizePhone(phone.trim());
    if (cleaned.length >= 7) {
      // Fetch phone candidates for this tenant and compare normalized
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
        // Update email if we have it and it's missing
        if (email?.trim() && !match.email) {
          await sb.from("people").update({ email: email.trim().toLowerCase() }).eq("id", match.id);
        }
        return { personId: match.id, isNew: false, reviewNeeded: false };
      }
    }
  }

  // 3. Name match (fuzzy — needs review)
  if (firstName?.trim() && lastName?.trim()) {
    const { data } = await sb
      .from("people")
      .select("id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .ilike("first_name", firstName.trim())
      .ilike("last_name", lastName.trim())
      .limit(1)
      .maybeSingle();
    if (data) {
      // Name match only — create new record; flag for review (possible duplicate)
      const newId = generateId();
      await sb.from("people").insert({
        id: newId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
        data_source: "quiz",
        data_updated_at: new Date().toISOString(),
      });
      await sb.from("tenant_people").insert({ tenant_id: tenantId, person_id: newId, linked_at: new Date().toISOString() });
      return { personId: newId, isNew: true, reviewNeeded: true };
    }
  }

  // 4. No match — create new person
  const personId = generateId();
  await sb.from("people").insert({
    id: personId,
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    email: email?.trim().toLowerCase() || null,
    phone: phone?.trim() || null,
    data_source: "quiz",
    data_updated_at: new Date().toISOString(),
  });
  await sb.from("tenant_people").insert({ tenant_id: tenantId, person_id: personId, linked_at: new Date().toISOString() });
  return { personId, isNew: true, reviewNeeded: false };
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const {
    survey_id,
    answers,
    personal_score,
    economic_score,
    result,
    first_name,
    last_name,
    email,
    phone,
  } = body as {
    survey_id: string;
    answers: Record<string, "agree" | "maybe" | "disagree">;
    personal_score: number;
    economic_score: number;
    result: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };

  if (!survey_id || !answers || personal_score === undefined || !result) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Find or create person
  const { personId, reviewNeeded } = await findOrCreatePerson(sb, tenant.id, {
    firstName: first_name,
    lastName: last_name,
    email,
    phone,
  });

  const now = new Date().toISOString();

  // Upsert survey session
  await sb.from("survey_sessions").upsert(
    { crm_contact_id: personId, survey_id, started_at: now, completed_at: now, last_question_answered: null },
    { onConflict: "crm_contact_id,survey_id" }
  );

  // Insert responses (one per answered question)
  const responseRows = Object.entries(answers).map(([questionId, answerValue]) => ({
    crm_contact_id: personId,
    survey_id,
    question_id: questionId,
    answer_value: answerValue,
  }));
  if (responseRows.length > 0) {
    await sb.from("responses").upsert(responseRows, { onConflict: "crm_contact_id,survey_id,question_id" });
  }

  // Build stop notes
  const scoreNote = `Personal: ${personal_score}/100 · Economic: ${economic_score}/100`;
  const reviewNote = reviewNeeded ? " · ⚠ REVIEW: possible duplicate" : "";
  const stopNotes = scoreNote + reviewNote;

  // Save Nolan scores to person record
  await sb.from("people").update({
    nolan_personal_score: personal_score,
    nolan_economic_score: economic_score,
  }).eq("id", personId);

  // Insert stop (walklist_id is now nullable)
  await sb.from("stops").insert({
    tenant_id: tenant.id,
    person_id: personId,
    channel: "quiz",
    result,
    notes: stopNotes,
    stop_at: now,
  });

  return NextResponse.json({ person_id: personId, review_needed: reviewNeeded });
}
