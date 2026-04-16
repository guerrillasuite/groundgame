import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature, ALL_FEATURE_KEYS } from "@/lib/features";
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
    person_id: string;
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
    .replace(/\{Person_ID\}/g, recipient.person_id || "")
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

  // ── Cron bypass: trusted internal call from /api/cron/dispatch ────────────────
  const incomingCronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = process.env.CRON_SECRET;
  const isCronCall =
    expectedCronSecret &&
    incomingCronSecret === expectedCronSecret;

  let tenantId: string;
  if (isCronCall) {
    const headerTenantId = req.headers.get("x-tenant-id");
    if (!headerTenantId) {
      return NextResponse.json({ error: "Missing x-tenant-id" }, { status: 400 });
    }
    tenantId = headerTenantId;
  } else {
    // Normal user-initiated send
    const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
    if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    tenantId = tenant.id;
  }

  const sb = makeSb(tenantId);

  // Load campaign
  const { data: campaign, error } = await sb
    .from("email_campaigns")
    .select("id, name, subject, preview_text, from_name, from_email, reply_to, html_body, design_json, status, audience_type, audience_list_id, audience_segment_filters, audience_person_ids")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!["draft", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign is already sent or cancelled" }, { status: 400 });
  }

  // ── Resolve recipients ─────────────────────────────────────────────────────

  let recipientPersonIds: string[] = [];

  if (campaign.audience_type === "manual" && campaign.audience_person_ids) {
    recipientPersonIds = (campaign.audience_person_ids as string[]).filter(Boolean);
  } else if (campaign.audience_type === "list" && campaign.audience_list_id) {
    const { data: items } = await sb
      .from("walklist_items")
      .select("person_id")
      .eq("walklist_id", campaign.audience_list_id)
      .not("person_id", "is", null);
    recipientPersonIds = (items ?? []).map((i: any) => i.person_id);
  } else if (campaign.audience_type === "segment") {
    const filters: Array<{ field: string; op: string; value: string }> =
      (campaign.audience_segment_filters as any[]) ?? [];

    // Fetch all people with email
    const { data: ppl } = await sb
      .from("people")
      .select("id, email, first_name, last_name, household_id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .not("email", "is", null)
      .neq("email", "")
      .limit(10000);

    let segRows: Array<Record<string, any>> = [...((ppl as any[]) ?? [])];

    // Enrich location if any filter needs it
    const needsLocation = filters.some((f) => ["city", "state", "postal_code"].includes(f.field));
    if (needsLocation && segRows.length > 0) {
      const hhIds = [...new Set(segRows.map((p) => p.household_id).filter(Boolean))] as string[];
      if (hhIds.length > 0) {
        const { data: hh } = await sb.from("households").select("id, location_id").in("id", hhIds.slice(0, 500));
        const locIds = (hh ?? []).map((h: any) => h.location_id).filter(Boolean);
        if (locIds.length > 0) {
          const { data: locs } = await sb.from("locations").select("id, city, state, postal_code").in("id", locIds.slice(0, 500));
          const locMap = new Map((locs ?? []).map((l: any) => [l.id, l]));
          const hhMap = new Map((hh ?? []).map((h: any) => [h.id, h]));
          segRows = segRows.map((p) => {
            const hhRow = p.household_id ? hhMap.get(p.household_id) : null;
            const loc = hhRow?.location_id ? locMap.get(hhRow.location_id) : null;
            return { ...p, city: loc?.city ?? "", state: loc?.state ?? "", postal_code: loc?.postal_code ?? "" };
          });
        }
      }
    }

    // Enrich company if needed
    const needsCompany = filters.some((f) => f.field.startsWith("company."));
    if (needsCompany && segRows.length > 0) {
      const pids = segRows.map((p) => p.id);
      const { data: pcRows } = await sb
        .from("person_companies")
        .select("person_id, company:company_id(name, industry, status)")
        .in("person_id", pids.slice(0, 1000));
      const companyByPersonId = new Map((pcRows ?? []).map((pc: any) => [pc.person_id, pc.company]));
      segRows = segRows.map((p) => ({ ...p, company: companyByPersonId.get(p.id) ?? {} }));
    }

    // Enrich opportunity if needed
    const needsOpp = filters.some((f) => f.field.startsWith("opp."));
    if (needsOpp && segRows.length > 0) {
      const pids = segRows.map((p) => p.id);
      const { data: opps } = await sb
        .from("opportunities")
        .select("contact_person_id, stage, pipeline, source, priority")
        .eq("tenant_id", tenantId)
        .in("contact_person_id", pids.slice(0, 1000));
      const oppByPersonId = new Map((opps ?? []).map((o: any) => [o.contact_person_id, o]));
      segRows = segRows.map((p) => ({ ...p, opp: oppByPersonId.get(p.id) ?? {} }));
    }

    // Apply filters
    if (filters.length > 0) {
      segRows = segRows.filter((row) =>
        filters.every((f) => {
          const parts = f.field.split(".");
          let val: any = row;
          for (const part of parts) { val = val?.[part]; if (val == null) { val = ""; break; } }
          const strVal = String(val ?? "").toLowerCase();
          const fVal = f.value.toLowerCase();
          switch (f.op) {
            case "contains":    return strVal.includes(fVal);
            case "equals":      return strVal === fVal;
            case "starts_with": return strVal.startsWith(fVal);
            case "not_contains": return !strVal.includes(fVal);
            case "is_empty":    return strVal === "";
            case "not_empty":   return strVal !== "";
            case "greater_than": return parseFloat(strVal) > parseFloat(fVal);
            case "less_than":   return parseFloat(strVal) < parseFloat(fVal);
            default:            return true;
          }
        })
      );
    }

    recipientPersonIds = segRows.map((p) => p.id);
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
      .eq("tenant_people.tenant_id", tenantId)
      .in("id", chunk)
      .not("email", "is", null)
      .neq("email", "");
    allPeople.push(...(data ?? []));
  }

  // ── Suppress unsubscribes ──────────────────────────────────────────────────

  const { data: unsubRows } = await sb
    .from("email_unsubscribes")
    .select("email_address")
    .eq("tenant_id", tenantId);

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
    tenant_id: tenantId,
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
      person_id: person.id,
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
          .update({ status: "sent", sent_at: new Date().toISOString(), resend_message_id: sent!.id })
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
