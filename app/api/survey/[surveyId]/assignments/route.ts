import { NextRequest, NextResponse } from "next/server";
import { getUserAssignments, syncUserAssignments } from "@/lib/db/supabase-surveys";

type Ctx = { params: Promise<{ surveyId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const userIds = await getUserAssignments(surveyId);
    return NextResponse.json({ user_ids: userIds });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const { user_ids } = await req.json() as { user_ids: string[] };
    if (!Array.isArray(user_ids)) {
      return NextResponse.json({ error: "user_ids must be an array" }, { status: 400 });
    }
    await syncUserAssignments(surveyId, user_ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save assignments" }, { status: 500 });
  }
}
