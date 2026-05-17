import { NextRequest, NextResponse } from "next/server";
import { getVarGroupsForTrigger } from "@/lib/automations/triggerVarGroups";

export async function GET(req: NextRequest) {
  const triggerType = req.nextUrl.searchParams.get("trigger_type") ?? "";
  const groups = getVarGroupsForTrigger(triggerType);
  return NextResponse.json({ groups });
}
