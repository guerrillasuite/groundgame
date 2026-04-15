import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Verify Resend webhook signature.
 * Resend signs requests with HMAC-SHA256 using the webhook signing secret.
 * Header: svix-signature (format: "v1,<base64-sig>")
 */
function verifySignature(payload: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  const svixId        = headers.get("svix-id") ?? "";
  const svixTimestamp = headers.get("svix-timestamp") ?? "";
  const svixSignature = headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Signed content = "{svix-id}.{svix-timestamp}.{body}"
  const signed = `${svixId}.${svixTimestamp}.${payload}`;
  const hmac = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"));
  hmac.update(signed);
  const computed = `v1,${hmac.digest("base64")}`;

  // svix-signature may contain multiple signatures separated by spaces
  return svixSignature.split(" ").some((sig) => sig === computed);
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  if (!verifySignature(body, req.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const svixId = req.headers.get("svix-id") ?? "";
  const sb = makeAdminSb();

  // Deduplication — skip if already processed
  const { data: existing } = await sb
    .from("webhook_dedup")
    .select("svix_id")
    .eq("svix_id", svixId)
    .single();

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Record as processed before handling (prevents double-processing on retry)
  await sb.from("webhook_dedup").insert({ svix_id: svixId });

  let event: { type: string; data: Record<string, any> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;
  const resendMessageId: string = data?.email_id ?? data?.id ?? "";

  if (!resendMessageId) {
    return NextResponse.json({ ok: true });
  }

  if (type === "email.sent") {
    await sb
      .from("email_sends")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("resend_message_id", resendMessageId);
  }

  if (type === "email.bounced") {
    const bounceType: "hard" | "soft" =
      data?.bounce?.type === "soft" ? "soft" : "hard";
    const bounceReason: string = data?.bounce?.message ?? data?.bounce?.description ?? "";

    // Update send record
    const { data: sendRow } = await sb
      .from("email_sends")
      .update({
        status: "bounced",
        bounced_at: new Date().toISOString(),
        bounce_type: bounceType,
        bounce_reason: bounceReason,
      })
      .eq("resend_message_id", resendMessageId)
      .select("person_id, email_address, tenant_id, campaign_id")
      .single();

    // Hard bounce → auto-unsubscribe
    if (bounceType === "hard" && sendRow) {
      await sb.from("email_unsubscribes").upsert(
        {
          tenant_id: sendRow.tenant_id,
          person_id: sendRow.person_id,
          email_address: sendRow.email_address,
          campaign_id: sendRow.campaign_id,
        },
        { onConflict: "tenant_id,email_address", ignoreDuplicates: true }
      );
    }
  }

  if (type === "email.delivery_delayed") {
    // Log only — no action required in V1
    console.log(`[dispatch] Delivery delayed for message ${resendMessageId}`);
  }

  return NextResponse.json({ ok: true });
}
