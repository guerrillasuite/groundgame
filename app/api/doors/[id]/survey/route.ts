import { NextResponse } from "next/server";
import { getWalklistSurveyId } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const survey_id = getWalklistSurveyId(id);
  return NextResponse.json({ survey_id });
}
