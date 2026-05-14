import { NextRequest, NextResponse } from "next/server";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSurvey, updateSurvey, deleteSurvey } from "@/lib/db/supabase-surveys";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function hashPassword(plaintext: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plaintext, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(plaintext, salt, 64);
  return timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

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
    const { title, description, website_url, footer_text, active_channels, public_slug, post_submit_survey_id, post_submit_required, post_submit_header, thankyou_message, learn_more_label, display_title, display_description, opp_trigger, op_intake_channels, prefill_contact, payment_enabled, storefront_mode, delivery_enabled, order_products, auto_fields, show_share, show_take_again, status, require_contact_id_url, respondent_confirmation_email_enabled, respondent_confirmation_email_subject, staff_notification_emails, allow_multiple_submissions, logo_display_enabled, button_label, submission_limit, expiration_at, webhook_url, show_results_after_submission, results_display_mode, password_enabled, new_password } = await request.json();

    // Resolve password_hash update
    let password_hash: string | null | undefined = undefined; // undefined = don't touch
    if (password_enabled === false) {
      password_hash = null; // clear it
    } else if (typeof new_password === "string" && new_password.trim()) {
      password_hash = hashPassword(new_password.trim());
    }
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
        post_submit_required: Boolean(post_submit_required),
        post_submit_header: post_submit_header || null,
        thankyou_message: thankyou_message || null,
        learn_more_label: learn_more_label || null,
        display_title: display_title || null,
        display_description: display_description || null,
        opp_trigger: opp_trigger ?? null,
        op_intake_channels: Array.isArray(op_intake_channels) ? op_intake_channels : [],
        prefill_contact: Boolean(prefill_contact),
        payment_enabled: Boolean(payment_enabled),
        storefront_mode: storefront_mode ?? null,
        delivery_enabled: Boolean(delivery_enabled),
        order_products: Array.isArray(order_products) ? order_products : null,
        auto_fields: Array.isArray(auto_fields) ? auto_fields : null,
        show_share: show_share !== false,
        show_take_again: show_take_again !== false,
        status: status ?? undefined,
        require_contact_id_url: Boolean(require_contact_id_url),
        respondent_confirmation_email_enabled: Boolean(respondent_confirmation_email_enabled),
        respondent_confirmation_email_subject: respondent_confirmation_email_subject ?? null,
        staff_notification_emails: Array.isArray(staff_notification_emails) ? staff_notification_emails : null,
        allow_multiple_submissions: Boolean(allow_multiple_submissions),
        logo_display_enabled: logo_display_enabled !== false,
        button_label: button_label ?? null,
        submission_limit: submission_limit != null ? Number(submission_limit) || null : null,
        expiration_at: expiration_at ?? null,
        webhook_url: webhook_url ?? null,
        show_results_after_submission: Boolean(show_results_after_submission),
        results_display_mode: results_display_mode ?? "none",
        ...(password_hash !== undefined ? { password_hash } : {}),
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

// PATCH — surgical field updates (e.g. status-only from list view Archive action)
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const body = await request.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) patch.status = body.status;
    if (body.active_channels !== undefined) patch.active_channels = body.active_channels;
    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const sb = makeSb();
    const { error } = await sb.from("surveys").update(patch).eq("id", surveyId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error patching survey:", error);
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
