import { NextRequest, NextResponse } from "next/server";
import { getSurvey, updateSurvey, deleteSurvey } from "@/lib/db/supabase-surveys";

type Ctx = { params: Promise<{ surveyId: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  const edit = request.nextUrl.searchParams.get("edit") === "1";
  try {
    const result = await getSurvey(surveyId, { requireActive: !edit });
    if (!result) {
      return NextResponse.json({ error: "Survey not found or inactive" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching survey:", error);
    return NextResponse.json({ error: "Failed to fetch survey" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const { title, description, active } = await request.json();
    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    await updateSurvey(surveyId, { title: title.trim(), description, active: Boolean(active) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating survey:", error);
    return NextResponse.json({ error: "Failed to update survey" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    await deleteSurvey(surveyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting survey:", error);
    return NextResponse.json({ error: "Failed to delete survey" }, { status: 500 });
  }
}
