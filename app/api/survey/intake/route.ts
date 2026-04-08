import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/**
 * GET /api/survey/intake?channel=door|dials|texts
 * Returns the tenant's designated op intake survey + questions for the given channel.
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const channel = req.nextUrl.searchParams.get("channel");

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  // Find a survey that:
  // 1. Has this channel in op_intake_channels
  // 2. Is active for the corresponding active_channels key
  const { data: surveys } = await sb
    .from("surveys")
    .select("id, title, op_intake_channels, active_channels")
    .eq("tenant_id", tenant.id)
    .eq("active", true);

  const intakeSurvey = (surveys ?? []).find((s: any) => {
    const intake: string[] = s.op_intake_channels ?? [];
    return intake.includes(channel);
  });

  if (!intakeSurvey) {
    return NextResponse.json({ survey: null });
  }

  const { data: questions } = await sb
    .from("questions")
    .select("id, question_text, question_type, options, display_format, required, order_index")
    .eq("survey_id", intakeSurvey.id)
    .order("order_index", { ascending: true });

  // Fetch view config for this channel's view type
  const channelToViewType: Record<string, string> = { door: "door", dials: "call", texts: "text" };
  const viewType = channelToViewType[channel] ?? "door";
  const { data: viewConfig } = await sb
    .from("survey_view_configs")
    .select("pagination, page_groups")
    .eq("survey_id", intakeSurvey.id)
    .eq("view_type", viewType)
    .maybeSingle();

  return NextResponse.json({
    survey: {
      id: intakeSurvey.id,
      title: intakeSurvey.title,
    },
    questions: questions ?? [],
    viewConfig: viewConfig ?? null,
  });
}
