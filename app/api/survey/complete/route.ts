import { NextRequest, NextResponse } from "next/server";
import { completeSession } from "@/lib/db/supabase-surveys";

export async function POST(request: NextRequest) {
  try {
    const { crm_contact_id, survey_id } = await request.json();

    if (!crm_contact_id || !survey_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await completeSession({ crm_contact_id, survey_id });

    return NextResponse.json({ success: true, message: "Survey completed successfully" });
  } catch (error) {
    console.error("Error completing survey:", error);
    return NextResponse.json({ error: "Failed to complete survey" }, { status: 500 });
  }
}
