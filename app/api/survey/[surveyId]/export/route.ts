import { NextRequest, NextResponse } from "next/server";
import { getSurveyExportData } from "@/lib/db/supabase-surveys";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params;
  const format = request.nextUrl.searchParams.get("format") || "csv";

  try {
    const { survey, sessions, questions, responses } = await getSurveyExportData(surveyId);

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    if (format === "csv") {
      const headers = [
        "Contact ID",
        "Question",
        "Answer",
        "Other Text",
        "Answered At",
        "Started At",
        "Completed At",
        "Status",
      ];

      // Build a session map for quick lookup
      const sessionMap = new Map(sessions.map((s: any) => [s.crm_contact_id, s]));

      // Join responses with questions
      const qMap = new Map(questions.map((q: any) => [q.id, q]));
      const rows = responses.map((r: any) => {
        const q = qMap.get(r.question_id);
        const sess = sessionMap.get(r.crm_contact_id) as any;
        return [
          r.crm_contact_id,
          q?.question_text ?? r.question_id,
          r.answer_value,
          r.answer_text ?? "",
          r.created_at,
          sess?.started_at ?? "",
          sess?.completed_at ?? "",
          sess?.completed_at ? "Complete" : "Partial",
        ];
      });

      const escape = (cell: any) => {
        const str = String(cell ?? "");
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };

      const csv = [
        headers.join(","),
        ...rows.map((row) => row.map(escape).join(",")),
      ].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="survey-${surveyId}-${Date.now()}.csv"`,
        },
      });
    }

    // JSON export
    const sessionMap = new Map(sessions.map((s: any) => [s.crm_contact_id, s]));
    const qMap = new Map(questions.map((q: any) => [q.id, q]));

    const byContact = responses.reduce((acc: any, row: any) => {
      if (!acc[row.crm_contact_id]) {
        const sess = sessionMap.get(row.crm_contact_id) as any;
        acc[row.crm_contact_id] = {
          contact_id: row.crm_contact_id,
          started_at: sess?.started_at ?? null,
          completed_at: sess?.completed_at ?? null,
          is_complete: !!sess?.completed_at,
          responses: [],
        };
      }
      const q = qMap.get(row.question_id) as any;
      acc[row.crm_contact_id].responses.push({
        question_id: row.question_id,
        question_text: q?.question_text,
        question_order: q?.order_index,
        answer_value: row.answer_value,
        answer_text: row.answer_text,
        answered_at: row.created_at,
      });
      return acc;
    }, {});

    return NextResponse.json({
      export_metadata: {
        survey_id: surveyId,
        survey_title: survey.title,
        survey_description: survey.description,
        survey_created_at: survey.created_at,
        exported_at: new Date().toISOString(),
        total_contacts: sessions.length,
        completed_responses: sessions.filter((s: any) => s.completed_at).length,
        partial_responses: sessions.filter((s: any) => !s.completed_at).length,
      },
      questions,
      responses: Object.values(byContact),
    });
  } catch (error) {
    console.error("Error exporting survey:", error);
    return NextResponse.json({ error: "Failed to export survey data" }, { status: 500 });
  }
}
