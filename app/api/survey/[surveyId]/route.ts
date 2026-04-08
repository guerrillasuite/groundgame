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
    const { title, description, website_url, footer_text, active_channels, public_slug, post_submit_survey_id, opp_trigger, op_intake_channels, payment_enabled, storefront_mode, delivery_enabled, order_products, auto_fields } = await request.json();
    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    try {
      await updateSurvey(surveyId, {
        title: title.trim(),
        description,
        website_url,
        footer_text,
        active_channels: Array.isArray(active_channels) ? active_channels : [],
        public_slug: public_slug?.trim() || undefined,
        post_submit_survey_id: post_submit_survey_id || null,
        opp_trigger: opp_trigger ?? null,
        op_intake_channels: Array.isArray(op_intake_channels) ? op_intake_channels : [],
        payment_enabled: Boolean(payment_enabled),
        storefront_mode: storefront_mode ?? null,
        delivery_enabled: Boolean(delivery_enabled),
        order_products: Array.isArray(order_products) ? order_products : null,
        auto_fields: Array.isArray(auto_fields) ? auto_fields : null,
      });
    } catch (err: any) {
      // Unique constraint violation on public_slug
      if (err?.code === "23505" || err?.message?.includes("unique")) {
        return NextResponse.json({ error: "That URL slug is already taken. Please choose a different one." }, { status: 409 });
      }
      throw err;
    }
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
