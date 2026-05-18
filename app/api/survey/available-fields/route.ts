import { NextResponse } from "next/server";
import { groupedExportFields } from "@/lib/db/survey-export-fields";

export async function GET() {
  return NextResponse.json(groupedExportFields());
}
