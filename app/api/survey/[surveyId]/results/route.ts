import { NextRequest, NextResponse } from "next/server";
import { getSurveyResults } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params;
  try {
    const tenant = await getTenant();
    const results = await getSurveyResults(surveyId, tenant.id);
    if (!results) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    console.log(`[results] survey=${surveyId} tenant=${tenant.id} sessions=${results.total_started} responses_total=${results.questions.reduce((s,q)=>s+q.total_responses,0)}`);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching results:", error);
    return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
  }
}
