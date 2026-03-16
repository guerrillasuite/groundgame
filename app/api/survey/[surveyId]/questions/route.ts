import { NextRequest, NextResponse } from "next/server";
import { createQuestion } from "@/lib/db/supabase-surveys";

type Ctx = { params: Promise<{ surveyId: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const { question_text, question_type, options, required, order_index } =
      await request.json();

    if (!question_text?.trim() || !question_type) {
      return NextResponse.json(
        { error: "question_text and question_type are required" },
        { status: 400 }
      );
    }

    const question_id =
      "q-" +
      Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    await createQuestion(surveyId, {
      id: question_id,
      question_text: question_text.trim(),
      question_type,
      options: options?.length ? options : null,
      required: Boolean(required),
      order_index: order_index ?? 999,
    });

    return NextResponse.json({ question_id }, { status: 201 });
  } catch (error) {
    console.error("Error creating question:", error);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}
