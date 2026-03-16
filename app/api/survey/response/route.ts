import { NextRequest, NextResponse } from "next/server";
import { saveResponse } from "@/lib/db/supabase-surveys";

export async function POST(request: NextRequest) {
  try {
    const { crm_contact_id, survey_id, question_id, answer_value, answer_text } =
      await request.json();

    if (!crm_contact_id || !survey_id || !question_id || !answer_value) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await saveResponse({ crm_contact_id, survey_id, question_id, answer_value, answer_text });

    return NextResponse.json({ success: true, message: "Response saved successfully" });
  } catch (error) {
    console.error("Error saving response:", error);
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }
}
