import { NextRequest, NextResponse } from "next/server";
import { getSurveyExportData, ALLOWED_EXTRA_PEOPLE_FIELDS } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";

const FIELD_LABELS: Record<string, string> = {
  party: "Party", voter_status: "Voter Status", voting_frequency: "Voting Frequency",
  early_voter: "Early Voter", absentee_type: "Absentee Type",
  likelihood_to_vote: "Likelihood to Vote", primary_likelihood: "Primary Likelihood",
  general_primary_likelihood: "General+Primary Likelihood",
  voted_general_2024: "Voted General 2024", voted_general_2022: "Voted General 2022",
  voted_general_2020: "Voted General 2020", voted_general_2018: "Voted General 2018",
  voted_primary_2024: "Voted Primary 2024", voted_primary_2022: "Voted Primary 2022",
  voted_primary_2020: "Voted Primary 2020",
  score_prog_dem: "Score: Prog. Dem", score_mod_dem: "Score: Mod. Dem",
  score_cons_rep: "Score: Cons. Rep", score_mod_rep: "Score: Mod. Rep",
  nolan_personal_score: "Nolan: Personal Freedom", nolan_economic_score: "Nolan: Economic Freedom",
  gender: "Gender", age: "Age", birth_date: "Birth Date", ethnicity: "Ethnicity",
  education_level: "Education Level", marital_status: "Marital Status",
  mailing_address: "Mailing Address", mailing_city: "City", mailing_state: "State", mailing_zip: "Zip",
  phone_cell: "Cell Phone", phone2: "Phone 2", email2: "Email 2",
  occupation: "Occupation", occupation_title: "Occupation Title",
  top_issues: "Top Issues", notes: "Notes", contact_type: "Contact Type",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params;
  const format = request.nextUrl.searchParams.get("format") || "csv";
  const extraFieldsParam = request.nextUrl.searchParams.get("extra_fields") ?? "";
  const extraFields = extraFieldsParam
    ? extraFieldsParam.split(",").map(f => f.trim()).filter(f => ALLOWED_EXTRA_PEOPLE_FIELDS.has(f))
    : [];

  try {
    const tenant = await getTenant();
    const data = await getSurveyExportData(surveyId, tenant.id, extraFields);

    if (!data || !data.survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const { survey, sessions, questions, responses, postSubmitQuestions, postSubmitResponses, contactMap, extraPeopleFields } = data;

    // Build per-person answer map (covers both main + post-submit surveys)
    const answersByPerson = new Map<string, Record<string, string>>();
    for (const r of [...responses, ...postSubmitResponses]) {
      const pid = (r as any).crm_contact_id;
      if (!pid) continue;
      if (!answersByPerson.has(pid)) answersByPerson.set(pid, {});
      answersByPerson.get(pid)![r.question_id] = r.answer_value ?? "";
    }

    // Session map for completion timestamps
    const sessionMap = new Map((sessions as any[]).map((s) => [s.crm_contact_id, s]));

    // Only include people who have a session in the MAIN survey (not post-submit-only respondents)
    const allPersonIds = [...new Set(
      (sessions as any[]).map((s) => s.crm_contact_id).filter(Boolean)
    )];

    const allQuestions = [...questions, ...postSubmitQuestions];

    const escape = (cell: any) => {
      const str = String(cell ?? "");
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    };

    if (format === "csv") {
      const headers = [
        "First Name", "Last Name", "Email", "Phone", "Completed At",
        ...extraPeopleFields.map(f => FIELD_LABELS[f] ?? f),
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
          ...extraPeopleFields.map(f => {
            const val = person?.[f];
            return Array.isArray(val) ? val.join("; ") : (val ?? "");
          }),
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
    const respondents = allPersonIds.map((personId) => {
      const person = contactMap.get(personId);
      const sess = sessionMap.get(personId) as any;
      const qAnswers = answersByPerson.get(personId) ?? {};
      const personFields: Record<string, any> = {};
      for (const f of extraPeopleFields) {
        const val = person?.[f];
        personFields[f] = Array.isArray(val) ? val.join(", ") : (val ?? null);
      }
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

    const personFieldDefs = extraPeopleFields.map(f => ({ key: f, label: FIELD_LABELS[f] ?? f }));

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
