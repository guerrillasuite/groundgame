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

// Chunk .in() queries to stay under PostgREST URL length limits (200 UUIDs/chunk)
async function inChunks(
  sb: any,
  table: string,
  selectCols: string,
  inCol: string,
  ids: string[],
  extraFilter?: (q: any) => any,
  chunkSize = 200
): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    let q = sb.from(table).select(selectCols).in(inCol, ids.slice(i, i + chunkSize));
    if (extraFilter) q = extraFilter(q);
    const { data } = await q;
    if (data) all.push(...data);
  }
  return all;
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
        const rows = await inChunks(adminSb, "people", directCols.join(", "), "id", allPersonIds);
        for (const row of rows) {
          peopleExtraMap.set(row.id, row);
          if (voteKeys.length > 0 && row.votes_history) {
            votesHistoryMap.set(row.id, row.votes_history);
          }
        }
      }

      // 2) tenant_people (contact_types, tags, notes — filtered by tenant)
      if (tpKeys.length > 0) {
        const tpCols = ["person_id", ...tpKeys.map(k => k.replace("tp.", ""))];
        const tpRows = await inChunks(
          tenantSb, "tenant_people", tpCols.join(", "), "person_id", allPersonIds,
          (q) => q.eq("tenant_id", tenant.id)
        );
        for (const row of tpRows) tpMap.set(row.person_id, row);
      }

      // 3) Households + Locations (resolve via person_households or people.household_id)
      if (needHouseholds) {
        // Get household IDs: try people.household_id first, augment with person_households junction
        const [phJunction, directHhRows] = await Promise.all([
          inChunks(tenantSb, "person_households", "person_id, household_id", "person_id", allPersonIds,
            (q) => q.eq("tenant_id", tenant.id)),
          inChunks(adminSb, "people", "id, household_id", "id", allPersonIds),
        ]);

        // Build personId → householdId map
        const personToHh = new Map<string, string>();
        for (const row of directHhRows) {
          if (row.household_id) personToHh.set(row.id, row.household_id);
        }
        for (const row of phJunction) {
          if (!personToHh.has(row.person_id)) personToHh.set(row.person_id, row.household_id);
        }

        const hhIds = [...new Set(personToHh.values())];

        if (hhIds.length > 0) {
          // Fetch households
          const hhCols = [...new Set(["id", "location_id", ...hhKeys.map(k => k.replace("hh.", ""))])];
          const hhRows = await inChunks(adminSb, "households", hhCols.join(", "), "id", hhIds);

          const hhById = new Map(hhRows.map((h: any) => [h.id, h]));

          // Fetch locations if needed
          let locById = new Map<string, any>();
          if (locKeys.length > 0) {
            const locIds = [...new Set(hhRows.map((h: any) => h.location_id).filter(Boolean))];
            if (locIds.length > 0) {
              const locCols = [...new Set(["id", ...locKeys.map(k => k.replace("loc.", ""))])];
              const locRows = await inChunks(adminSb, "locations", locCols.join(", "), "id", locIds);
              locById = new Map(locRows.map((l: any) => [l.id, l]));
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
