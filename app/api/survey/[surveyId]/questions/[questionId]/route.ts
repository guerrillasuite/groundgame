import { NextRequest, NextResponse } from "next/server";
import { updateQuestion, deleteQuestion } from "@/lib/db/supabase-surveys";

type Ctx = { params: Promise<{ surveyId: string; questionId: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { questionId } = await params;
  try {
    const { question_text, question_type, options, display_format, crm_field, required, order_index } =
      await request.json();

    if (!question_text?.trim() || !question_type) {
      return NextResponse.json(
        { error: "question_text and question_type are required" },
        { status: 400 }
      );
    }

    await updateQuestion(questionId, {
      question_text: question_text.trim(),
      question_type,
      options: options?.length ? options : null,
      display_format: display_format ?? null,
      crm_field: crm_field ?? null,
      required: Boolean(required),
      order_index: order_index ?? 999,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating question:", error);
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { surveyId, questionId } = await params;
  try {
    await deleteQuestion(questionId, surveyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting question:", error);
    return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
  }
}
