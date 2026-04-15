import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { Resend } from "resend";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes for large sends
export const maxDuration = 300;

const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.guerrillasuite.com";

function makeAdminSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/** Sleep for ms milliseconds */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Short URL-safe hash of a string */
function urlHash(str: string): string {
  return createHash("sha256").update(str).digest("base64url").slice(0, 10);
}

/** Perform mail-merge substitutions on html for a single recipient */
function mergeHtml(
  html: string,
  recipient: {
    send_id: string;
    first_name: string;
    last_name: string;
    email: string;
    city: string;
    state: string;
  }
): string {
  const full = [recipient.first_name, recipient.last_name].filter(Boolean).join(" ");
  const unsubUrl = `${APP_URL}/unsubscribe/${recipient.send_id}`;

  return html
    .replace(/\{First_Name\}/g, recipient.first_name || "")
    .replace(/\{Last_Name\}/g, recipient.last_name || "")
    .replace(/\{Full_Name\}/g, full || "")
    .replace(/\{Email\}/g, recipient.email || "")
    .replace(/\{City\}/g, recipient.city || "")
    .replace(/\{State\}/g, recipient.state || "")
    .replace(/\{Unsubscribe_Link\}/g, unsubUrl)
    .replace(/\{Trackable_Link_URL\}/g, ""); // handled separately per campaign
}

/** Replace {Trackable_Link_URL} with a per-send redirect URL, storing the mapping */
function applyTrackableLink(
  html: string,
  sendId: string,
  clickMap: Record<string, string>
): string {
  return html.replace(/\{Trackable_Link_URL\}/g, () => {
    // Get first entry in clickMap (there should only be one trackable link per campaign)
    const [hash] = Object.keys(clickMap);
    if (!hash) return "";
    return `${APP_URL}/r/${sendId}/${hash}`;
  });
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: campaignId } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);

  // Load campaign
  const { data: campaign, error } = await sb
    .from("email_campaigns")
    .select("id, name, subject, preview_text, from_name, from_email, reply_to, html_body, design_json, status, audience_type, audience_list_id, audience_segment_filters")
    .eq("id", campaignId)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!["draft", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign is already sent or cancelled" }, { status: 400 });
  }

  // ── Resolve recipients ─────────────────────────────────────────────────────

  let recipientPersonIds: string[] = [];

  if (campaign.audience_type === "list" && campaign.audience_list_id) {
    const { data: items } = await sb
      .from("walklist_items")
      .select("person_id")
      .eq("walklist_id", campaign.audience_list_id)
      .not("person_id", "is", null);
    recipientPersonIds = (items ?? []).map((i: any) => i.person_id);
  } else if (campaign.audience_type === "segment") {
    // Resolve segment filters — fetch all people with email
    const { data: ppl } = await sb
      .from("people")
      .select("id, email, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .not("email", "is", null)
      .neq("email", "");
    recipientPersonIds = (ppl ?? []).map((p: any) => p.id);
    // TODO: apply audience_segment_filters when filter engine is wired up
  }

  if (recipientPersonIds.length === 0) {
    return NextResponse.json({ error: "No recipients found for this campaign" }, { status: 400 });
  }

  // ── Fetch person details (in chunks of 500) ────────────────────────────────

  type PersonData = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    household_id: string | null;
  };

  const allPeople: PersonData[] = [];
  for (let i = 0; i < recipientPersonIds.length; i += 500) {
    const chunk = recipientPersonIds.slice(i, i + 500);
    const { data } = await sb
      .from("people")
      .select("id, first_name, last_name, email, household_id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .in("id", chunk)
      .not("email", "is", null)
      .neq("email", "");
    allPeople.push(...(data ?? []));
  }

  // ── Suppress unsubscribes ──────────────────────────────────────────────────

  const { data: unsubRows } = await sb
    .from("email_unsubscribes")
    .select("email_address")
    .eq("tenant_id", tenant.id);

  const unsubEmails = new Set((unsubRows ?? []).map((u: any) => u.email_address.toLowerCase()));

  const eligible = allPeople.filter(
    (p) => p.email && !unsubEmails.has(p.email.toLowerCase())
  );

  if (eligible.length === 0) {
    return NextResponse.json({ error: "All recipients are unsubscribed" }, { status: 400 });
  }

  // ── Fetch location data for City/State merge tags ──────────────────────────

  const householdIds = [...new Set(eligible.map((p) => p.household_id).filter(Boolean))] as string[];
  const locationMap = new Map<string, { city: string; state: string }>();

  if (householdIds.length > 0) {
    const { data: hh } = await sb
      .from("households")
      .select("id, location_id")
      .in("id", householdIds.slice(0, 500));

    const locationIds = (hh ?? []).map((h: any) => h.location_id).filter(Boolean);
    if (locationIds.length > 0) {
      const { data: locs } = await sb
        .from("locations")
        .select("id, city, state")
        .in("id", locationIds.slice(0, 500));

      const locById = new Map((locs ?? []).map((l: any) => [l.id, l]));
      for (const h of hh ?? []) {
        const loc = locById.get(h.location_id);
        if (loc) locationMap.set(h.id, { city: loc.city ?? "", state: loc.state ?? "" });
      }
    }
  }

  // ── Build click map for trackable links ────────────────────────────────────

  // Extract {Trackable_Link_URL} placeholder — store the configured destination URL
  const trackableUrl = (campaign.design_json as any)?.trackable_link_url ?? "";
  const clickMap: Record<string, string> = {};
  if (trackableUrl) {
    const hash = urlHash(trackableUrl);
    clickMap[hash] = trackableUrl;
  }

  // Persist click map back to campaign design_json
  if (trackableUrl) {
    await sb
      .from("email_campaigns")
      .update({ design_json: { ...(campaign.design_json as object), click_map: clickMap } })
      .eq("id", campaignId);
  }

  // ── Mark campaign as sending ───────────────────────────────────────────────

  await sb
    .from("email_campaigns")
    .update({ status: "sending", audience_count: eligible.length })
    .eq("id", campaignId);

  // ── Insert all send rows as queued ─────────────────────────────────────────

  const sendInserts = eligible.map((p) => ({
    campaign_id: campaignId,
    tenant_id: tenant.id,
    person_id: p.id,
    email_address: p.email!,
    status: "queued",
  }));

  const { data: insertedSends } = await sb
    .from("email_sends")
    .insert(sendInserts)
    .select("id, person_id, email_address");

  const sends = insertedSends ?? [];

  // Map person_id → send_id
  const sendByPersonId = new Map(sends.map((s: any) => [s.person_id, s.id]));

  // ── Send emails via Resend ─────────────────────────────────────────────────

  const resend = new Resend(process.env.RESEND_DISPATCH_API_KEY);
  const baseHtml = campaign.html_body;
  const fromField = `${campaign.from_name} <${campaign.from_email}>`;

  let sentCount = 0;
  let failedCount = 0;

  for (const person of eligible) {
    const sendId = sendByPersonId.get(person.id);
    if (!sendId) continue;

    const loc = person.household_id ? (locationMap.get(person.household_id) ?? { city: "", state: "" }) : { city: "", state: "" };

    // Mail-merge
    let html = mergeHtml(baseHtml, {
      send_id: sendId,
      first_name: person.first_name ?? "",
      last_name: person.last_name ?? "",
      email: person.email ?? "",
      city: loc.city,
      state: loc.state,
    });

    // Apply trackable link
    if (trackableUrl) {
      html = applyTrackableLink(html, sendId, clickMap);
    }

    try {
      const { data: sent, error: sendErr } = await resend.emails.send({
        from: fromField,
        to: person.email!,
        subject: campaign.subject,
        html,
        replyTo: campaign.reply_to ?? undefined,
        headers: {
          "List-Unsubscribe": `<${APP_URL}/unsubscribe/${sendId}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      if (sendErr) {
        await sb
          .from("email_sends")
          .update({ status: "failed" })
          .eq("id", sendId);
        failedCount++;
      } else {
        await sb
          .from("email_sends")
          .update({ resend_message_id: sent!.id })
          .eq("id", sendId);
        sentCount++;
      }
    } catch {
      await sb
        .from("email_sends")
        .update({ status: "failed" })
        .eq("id", sendId);
      failedCount++;
    }

    // Rate limit: Resend allows ~2 requests/second on paid plan
    // Send a batch of 2, then pause 1s
    if (sentCount % 2 === 0) {
      await sleep(1000);
    }
  }

  // ── Mark campaign as sent ──────────────────────────────────────────────────

  await sb
    .from("email_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", campaignId);

  return NextResponse.json({ ok: true, sent: sentCount, failed: failedCount });
}
