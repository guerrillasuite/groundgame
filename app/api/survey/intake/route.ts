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
 * GET /api/survey/intake?channel=door|dials|texts|storefront
 *
 * For door/dials/texts: returns the tenant's designated op intake survey
 *   (surveys where op_intake_channels contains the channel).
 *
 * For storefront: returns the survey with active_channels containing "storefront".
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const channel = req.nextUrl.searchParams.get("channel");

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const { data: surveys } = await sb
    .from("surveys")
    .select("id, title, op_intake_channels, active_channels, storefront_mode, delivery_enabled, payment_enabled, order_products")
    .eq("tenant_id", tenant.id)
    .eq("active", true);

  let intakeSurvey: any = null;

  if (channel === "storefront") {
    // Find survey with storefront in active_channels
    intakeSurvey = (surveys ?? []).find((s: any) => {
      const ch: string[] = s.active_channels ?? [];
      return ch.includes("storefront");
    });
  } else {
    // Find survey designated as intake form for this field channel
    intakeSurvey = (surveys ?? []).find((s: any) => {
      const intake: string[] = s.op_intake_channels ?? [];
      return intake.includes(channel);
    });
  }

  if (!intakeSurvey) {
    return NextResponse.json({ survey: null });
  }

  const { data: questions } = await sb
    .from("questions")
    .select("id, question_text, question_type, options, display_format, required, order_index, crm_field, conditions")
    .eq("survey_id", intakeSurvey.id)
    .order("order_index", { ascending: true });

  // Map channel to view type
  const channelToViewType: Record<string, string> = {
    door: "door",
    dials: "call",
    texts: "text",
    storefront: "embedded",
  };
  const viewType = channelToViewType[channel] ?? "embedded";
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
      storefront_mode: intakeSurvey.storefront_mode ?? null,
      delivery_enabled: Boolean(intakeSurvey.delivery_enabled),
      payment_enabled: Boolean(intakeSurvey.payment_enabled),
      order_products: intakeSurvey.order_products ?? null,
    },
    questions: questions ?? [],
    viewConfig: viewConfig ?? null,
  });
}
