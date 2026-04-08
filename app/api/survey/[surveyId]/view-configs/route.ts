import { NextRequest, NextResponse } from "next/server";
import { getViewConfigs, upsertViewConfigs } from "@/lib/db/supabase-surveys";
import type { ViewType, PaginationMode } from "@/lib/db/supabase-surveys";

type Ctx = { params: Promise<{ surveyId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const configs = await getViewConfigs(surveyId);
    return NextResponse.json({ configs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch view configs" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const { configs } = await req.json() as {
      configs: Array<{ view_type: ViewType; pagination: PaginationMode; page_groups?: string[][][] | null }>;
    };
    if (!Array.isArray(configs)) {
      return NextResponse.json({ error: "configs must be an array" }, { status: 400 });
    }
    await upsertViewConfigs(surveyId, configs);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save view configs" }, { status: 500 });
  }
}
