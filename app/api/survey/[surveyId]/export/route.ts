import { NextRequest, NextResponse } from "next/server";
import { getSurveyExportData } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params;
  const format = request.nextUrl.searchParams.get("format") || "csv";

  try {
    const tenant = await getTenant();
    const data = await getSurveyExportData(surveyId, tenant.id);

    if (!data || !data.survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const { survey, sessions, questions, responses, postSubmitQuestions, postSubmitResponses, contactMap } = data;

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

    // All unique respondents (session exists OR answered post-submit form)
    const allPersonIds = [...new Set([
      ...(sessions as any[]).map((s) => s.crm_contact_id),
      ...postSubmitResponses.map((r: any) => r.crm_contact_id),
    ].filter(Boolean))];

    const allQuestions = [...questions, ...postSubmitQuestions];

    const escape = (cell: any) => {
      const str = String(cell ?? "");
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    };

    if (format === "csv") {
      const headers = [
        "First Name", "Last Name", "Email", "Phone", "Completed At",
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
          ...allQuestions.map((q: any) => qAnswers[q.id] ?? ""),
        ];
      });

      const csv = [
        headers.join(","),
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
      return {
        person_id: personId,
        first_name: person?.first_name ?? null,
        last_name: person?.last_name ?? null,
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        completed_at: sess?.completed_at ?? null,
        answers: qAnswers,
      };
    });

    return NextResponse.json({
      survey_id: surveyId,
      survey_title: survey.title,
      questions: allQuestions.map((q: any) => ({ id: q.id, question_text: q.question_text, order_index: q.order_index })),
      respondents,
    });
  } catch (error) {
    console.error("Error exporting survey:", error);
    return NextResponse.json({ error: "Failed to export survey data" }, { status: 500 });
  }
}
