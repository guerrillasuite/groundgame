import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSurveyExportData } from "@/lib/db/supabase-surveys";
import { ALLOWED_EXPORT_KEYS, EXPORT_FIELD_MAP } from "@/lib/db/survey-export-fields";
import { getTenant } from "@/lib/tenant";

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function makeTenantClient(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// Serialize a raw DB value to a display string
function serialize(val: any): string {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) return val.join("; ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params;
  const format = request.nextUrl.searchParams.get("format") || "csv";
  const extraFieldsParam = request.nextUrl.searchParams.get("extra_fields") ?? "";
  const requestedFields = extraFieldsParam
    ? extraFieldsParam.split(",").map(f => f.trim()).filter(f => ALLOWED_EXPORT_KEYS.has(f))
    : [];

  try {
    const tenant = await getTenant();
    const data = await getSurveyExportData(surveyId, tenant.id);

    if (!data || !data.survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const { survey, sessions, questions, responses, postSubmitQuestions, postSubmitResponses, contactMap } = data;

    // Per-person answer map (covers both main + post-submit surveys)
    const answersByPerson = new Map<string, Record<string, string>>();
    for (const r of [...responses, ...postSubmitResponses]) {
      const pid = (r as any).crm_contact_id;
      if (!pid) continue;
      if (!answersByPerson.has(pid)) answersByPerson.set(pid, {});
      answersByPerson.get(pid)![r.question_id] = r.answer_value ?? "";
    }

    // Session map for completion timestamps (only main survey sessions)
    const sessionMap = new Map((sessions as any[]).map((s) => [s.crm_contact_id, s]));

    // Respondent list: only people with a main-survey session
    const allPersonIds = [...new Set(
      (sessions as any[]).map((s) => s.crm_contact_id).filter(Boolean)
    )];

    // ── Partition requested fields by source ──────────────────────────────────
    const peopleDirectKeys = requestedFields.filter(k => EXPORT_FIELD_MAP.get(k)?.source === "people");
    const voteKeys         = requestedFields.filter(k => EXPORT_FIELD_MAP.get(k)?.source === "votes_history");
    const tpKeys           = requestedFields.filter(k => EXPORT_FIELD_MAP.get(k)?.source === "tenant_people");
    const hhKeys           = requestedFields.filter(k => EXPORT_FIELD_MAP.get(k)?.source === "households");
    const locKeys          = requestedFields.filter(k => EXPORT_FIELD_MAP.get(k)?.source === "locations");

    const needHouseholds   = hhKeys.length > 0 || locKeys.length > 0;

    // ── Extra field maps keyed by person ID ───────────────────────────────────
    const peopleExtraMap   = new Map<string, Record<string, any>>();
    const votesHistoryMap  = new Map<string, Record<string, any>>();
    const tpMap            = new Map<string, Record<string, any>>();
    const householdMap     = new Map<string, Record<string, any>>();  // personId → hh row
    const locationMap      = new Map<string, Record<string, any>>();  // personId → loc row

    if (allPersonIds.length > 0) {
      const adminSb = makeAdminClient();
      const tenantSb = makeTenantClient(tenant.id);

      // 1) Direct people columns (+ votes_history if any vote.* keys requested)
      const directCols = [...new Set([
        "id",
        ...peopleDirectKeys,
        ...(voteKeys.length > 0 ? ["votes_history"] : []),
      ])];
      if (directCols.length > 1) {
        const { data: rows, error } = await adminSb
          .from("people")
          .select(directCols.join(", "))
          .in("id", allPersonIds);
        if (error) console.error("[survey export] people query error:", error);
        for (const row of (rows ?? []) as any[]) {
          peopleExtraMap.set(row.id, row);
          if (voteKeys.length > 0 && row.votes_history) {
            votesHistoryMap.set(row.id, row.votes_history);
          }
        }
      }

      // 2) tenant_people (contact_types, tags, notes — filtered by tenant)
      if (tpKeys.length > 0) {
        const tpCols = ["person_id", ...tpKeys.map(k => k.replace("tp.", ""))];
        const { data: tpRows, error } = await tenantSb
          .from("tenant_people")
          .select(tpCols.join(", "))
          .eq("tenant_id", tenant.id)
          .in("person_id", allPersonIds);
        if (error) console.error("[survey export] tenant_people query error:", error);
        for (const row of (tpRows ?? []) as any[]) tpMap.set(row.person_id, row);
      }

      // 3) Households + Locations (resolve via person_households or people.household_id)
      if (needHouseholds) {
        // Get household IDs: try people.household_id first, augment with person_households junction
        const { data: phJunction } = await tenantSb
          .from("person_households")
          .select("person_id, household_id")
          .eq("tenant_id", tenant.id)
          .in("person_id", allPersonIds);
        const { data: directHhRows } = await adminSb
          .from("people")
          .select("id, household_id")
          .in("id", allPersonIds);

        // Build personId → householdId map
        const personToHh = new Map<string, string>();
        for (const row of (directHhRows ?? []) as any[]) {
          if (row.household_id) personToHh.set(row.id, row.household_id);
        }
        for (const row of (phJunction ?? []) as any[]) {
          if (!personToHh.has(row.person_id)) personToHh.set(row.person_id, row.household_id);
        }

        const hhIds = [...new Set(personToHh.values())];

        if (hhIds.length > 0) {
          // Fetch households
          const hhCols = ["id", "location_id", ...hhKeys.map(k => k.replace("hh.", ""))];
          const { data: hhRows, error: hhErr } = await adminSb
            .from("households")
            .select([...new Set(hhCols)].join(", "))
            .in("id", hhIds);
          if (hhErr) console.error("[survey export] households query error:", hhErr);

          const hhById = new Map((hhRows ?? []).map((h: any) => [h.id, h]));

          // Fetch locations if needed
          let locById = new Map<string, any>();
          if (locKeys.length > 0) {
            const locIds = [...new Set(
              (hhRows ?? []).map((h: any) => h.location_id).filter(Boolean)
            )];
            if (locIds.length > 0) {
              const locCols = ["id", ...locKeys.map(k => k.replace("loc.", ""))];
              const { data: locRows, error: locErr } = await adminSb
                .from("locations")
                .select([...new Set(locCols)].join(", "))
                .in("id", locIds);
              if (locErr) console.error("[survey export] locations query error:", locErr);
              locById = new Map((locRows ?? []).map((l: any) => [l.id, l]));
            }
          }

          // Map person → hh row and person → loc row
          for (const [personId, hhId] of personToHh) {
            const hh = hhById.get(hhId);
            if (hh) {
              householdMap.set(personId, hh);
              if (hh.location_id) {
                const loc = locById.get(hh.location_id);
                if (loc) locationMap.set(personId, loc);
              }
            }
          }
        }
      }
    }

    // ── Build value resolver ──────────────────────────────────────────────────
    function resolveField(personId: string, fieldKey: string): string {
      const def = EXPORT_FIELD_MAP.get(fieldKey);
      if (!def) return "";

      if (def.source === "people") {
        const val = peopleExtraMap.get(personId)?.[fieldKey];
        return serialize(val);
      }

      if (def.source === "votes_history") {
        const subKey = fieldKey.replace("vote.", "");
        const val = votesHistoryMap.get(personId)?.[subKey];
        return serialize(val);
      }

      if (def.source === "tenant_people") {
        const col = fieldKey.replace("tp.", "");
        const val = tpMap.get(personId)?.[col];
        return serialize(val);
      }

      if (def.source === "households") {
        const col = fieldKey.replace("hh.", "");
        const val = householdMap.get(personId)?.[col];
        return serialize(val);
      }

      if (def.source === "locations") {
        const col = fieldKey.replace("loc.", "");
        const val = locationMap.get(personId)?.[col];
        return serialize(val);
      }

      return "";
    }

    const allQuestions = [...questions, ...postSubmitQuestions];

    const escape = (cell: any) => {
      const str = String(cell ?? "");
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    };

    if (format === "csv") {
      const headers = [
        "First Name", "Last Name", "Email", "Phone", "Completed At",
        ...requestedFields.map(k => EXPORT_FIELD_MAP.get(k)?.label ?? k),
        ...allQuestions.map((q: any) => q.question_text),
      ];

      const rows = allPersonIds.map((personId) => {
        const person = contactMap.get(personId);
        const sess = sessionMap.get(personId) as any;
        const qAnswers = answersByPerson.get(personId) ?? {};
        return [
          person?.first_name ?? "",
          person?.last_name ?? "",
          person?.email ?? "",
          person?.phone ?? "",
          sess?.completed_at ? new Date(sess.completed_at).toLocaleString() : "",
          ...requestedFields.map(k => resolveField(personId, k)),
          ...allQuestions.map((q: any) => qAnswers[q.id] ?? ""),
        ];
      });

      const csv = [
        headers.map(escape).join(","),
        ...rows.map((row) => row.map(escape).join(",")),
      ].join("\n");

      const safeName = survey.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${safeName}-${Date.now()}.csv"`,
        },
      });
    }

    // JSON: return structured per-person data (used by Results dashboard "Responses" tab)
    const personFieldDefs = requestedFields.map(k => ({
      key: k,
      label: EXPORT_FIELD_MAP.get(k)?.label ?? k,
    }));

    const respondents = allPersonIds.map((personId) => {
      const person = contactMap.get(personId);
      const sess = sessionMap.get(personId) as any;
      const qAnswers = answersByPerson.get(personId) ?? {};
      const personFields: Record<string, string> = {};
      for (const k of requestedFields) personFields[k] = resolveField(personId, k);
      return {
        person_id: personId,
        first_name: person?.first_name ?? null,
        last_name: person?.last_name ?? null,
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        completed_at: sess?.completed_at ?? null,
        answers: qAnswers,
        personFields,
      };
    });

    return NextResponse.json({
      survey_id: surveyId,
      survey_title: survey.title,
      questions: allQuestions.map((q: any) => ({ id: q.id, question_text: q.question_text, order_index: q.order_index })),
      respondents,
      personFieldDefs,
    });
  } catch (error) {
    console.error("Error exporting survey:", error);
    return NextResponse.json({ error: "Failed to export survey data" }, { status: 500 });
  }
}
