// lib/dispatch/sendCampaign.ts
// Core campaign-send logic shared by the manual send route and the cron dispatcher.
// Extracted here so the cron can call it directly without an HTTP round-trip.
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createHash } from "crypto";
import {
  applyFilter,
  fetchAll,
  resolveCol,
  LOCATION_JOIN_FIELDS,
  HOUSEHOLD_JOIN_FIELDS,
  resolvePersonIdsByHouseholds,
  FilterOp,
} from "@/app/api/crm/search/route";

const APP_URL =
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://app.guerrillasuite.com";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urlHash(str: string): string {
  return createHash("sha256").update(str).digest("base64url").slice(0, 10);
}

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
    .replace(/\{Trackable_Link_URL\}/g, ""); // handled separately via applyTrackableLink
}

function applyTrackableLink(
  html: string,
  sendId: string,
  clickMap: Record<string, string>
): string {
  return html.replace(/\{Trackable_Link_URL\}/g, () => {
    const [hash] = Object.keys(clickMap);
    if (!hash) return "";
    return `${APP_URL}/r/${sendId}/${hash}`;
  });
}

function jsFilterSeg(f: { field: string; op: string; value: string }, row: Record<string, any>): boolean {
  const parts = f.field.split(".");
  let val: any = row;
  for (const p of parts) { val = val?.[p]; if (val == null) { val = ""; break; } }
  const s = String(val ?? "").toLowerCase();
  const v = f.value.toLowerCase();
  switch (f.op) {
    case "contains":     return s.includes(v);
    case "equals":       return s === v;
    case "starts_with":  return s.startsWith(v);
    case "not_contains": return !s.includes(v);
    case "is_empty":     return s === "";
    case "not_empty":    return s !== "";
    case "greater_than": return parseFloat(s) > parseFloat(v);
    case "less_than":    return parseFloat(s) < parseFloat(v);
    default:             return true;
  }
}

export type SendCampaignResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; error: string; httpStatus: number };

export async function sendCampaign(
  tenantId: string,
  campaignId: string
): Promise<SendCampaignResult> {
  const sb = makeSb(tenantId);

  // ── Load campaign ────────────────────────────────────────────────────────────
  const { data: campaign, error } = await sb
    .from("email_campaigns")
    .select(
      "id, name, subject, preview_text, from_name, from_email, reply_to, html_body, design_json, status, audience_type, audience_list_id, audience_segment_filters, audience_person_ids"
    )
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !campaign) {
    return { ok: false, error: "Campaign not found", httpStatus: 404 };
  }

  if (!["draft", "scheduled"].includes(campaign.status)) {
    return { ok: false, error: "Campaign is already sent or cancelled", httpStatus: 400 };
  }

  // ── Resolve recipient person IDs ─────────────────────────────────────────────
  let recipientPersonIds: string[] = [];
  let segRows: Array<Record<string, any>> = []; // populated for segment audience; reused below

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
    type SegFilter = { field: string; op: string; value: string; data_type?: string };
    const filters: SegFilter[] = (campaign.audience_segment_filters as any[]) ?? [];
    let goto_send = false;

    const directFilters    = filters.filter((f) => !LOCATION_JOIN_FIELDS.has(f.field) && !HOUSEHOLD_JOIN_FIELDS.has(f.field) && !f.field.startsWith("company.") && !f.field.startsWith("opp."));
    const locationFilters  = filters.filter((f) => LOCATION_JOIN_FIELDS.has(f.field));
    const householdFilters = filters.filter((f) => HOUSEHOLD_JOIN_FIELDS.has(f.field));
    const companyFilters   = filters.filter((f) => f.field.startsWith("company."));
    const oppFilters       = filters.filter((f) => f.field.startsWith("opp."));

    // Resolve location filters → person IDs
    let personIdFilterFromLocation: string[] | null = null;
    if (locationFilters.length > 0) {
      const locData = await fetchAll(() => {
        let q = sb.from("locations").select("id").eq("tenant_id", tenantId);
        for (const f of locationFilters) q = applyFilter(q, resolveCol(f.field), f.op as FilterOp, f.value, f.data_type);
        return q;
      });
      const locIds = locData.map((l: any) => l.id);
      if (locIds.length === 0) { recipientPersonIds = []; segRows = []; goto_send = true; }
      else {
        const { data: hhs } = await sb.from("households").select("id").eq("tenant_id", tenantId).in("location_id", locIds);
        const hhIds = (hhs ?? []).map((h: any) => h.id);
        if (hhIds.length === 0) { recipientPersonIds = []; segRows = []; goto_send = true; }
        else {
          personIdFilterFromLocation = await resolvePersonIdsByHouseholds(sb, tenantId, hhIds);
          if (personIdFilterFromLocation.length === 0) { recipientPersonIds = []; segRows = []; goto_send = true; }
        }
      }
    }

    // Resolve household filters → person IDs
    let personIdFilterFromHH: string[] | null = null;
    if (!goto_send && householdFilters.length > 0) {
      const hhData = await fetchAll(() => {
        let q = sb.from("households").select("id").eq("tenant_id", tenantId);
        for (const f of householdFilters) q = applyFilter(q, f.field, f.op as FilterOp, f.value, f.data_type);
        return q;
      });
      const hhIds = hhData.map((h: any) => h.id);
      if (hhIds.length === 0) { recipientPersonIds = []; segRows = []; goto_send = true; }
      else {
        personIdFilterFromHH = await resolvePersonIdsByHouseholds(sb, tenantId, hhIds);
        if (personIdFilterFromHH.length === 0) { recipientPersonIds = []; segRows = []; goto_send = true; }
      }
    }

    if (!goto_send) {
      // Intersect person ID sets
      let finalPersonIdFilter: string[] | null = null;
      if (personIdFilterFromLocation && personIdFilterFromHH) {
        const setHH = new Set(personIdFilterFromHH);
        finalPersonIdFilter = personIdFilterFromLocation.filter((id) => setHH.has(id));
        if (finalPersonIdFilter.length === 0) { recipientPersonIds = []; segRows = []; goto_send = true; }
      } else {
        finalPersonIdFilter = personIdFilterFromLocation ?? personIdFilterFromHH ?? null;
      }

      if (!goto_send) {
        // Fetch people via PostgREST (no row limit)
        segRows = await fetchAll(() => {
          let q = sb
            .from("people")
            .select("id, first_name, last_name, email, household_id, tenant_people!inner(tenant_id)")
            .eq("tenant_people.tenant_id", tenantId)
            .not("email", "is", null)
            .neq("email", "");
          for (const f of directFilters) q = applyFilter(q, resolveCol(f.field), f.op as FilterOp, f.value, f.data_type);
          if (finalPersonIdFilter) q = q.in("id", finalPersonIdFilter);
          return q;
        });

        // Deduplicate
        segRows = [...new Map(segRows.map((p: any) => [p.id, p])).values()];

        // Company JS enrichment + filter
        if (companyFilters.length > 0 && segRows.length > 0) {
          const pids = segRows.map((p: any) => p.id);
          const pcRows: any[] = [];
          for (let i = 0; i < pids.length; i += 200) {
            const { data } = await sb.from("person_companies")
              .select("person_id, company:company_id(name, industry, status)")
              .in("person_id", pids.slice(i, i + 200));
            pcRows.push(...(data ?? []));
          }
          const companyMap = new Map(pcRows.map((pc: any) => [pc.person_id, pc.company]));
          segRows = segRows.map((p: any) => ({ ...p, company: companyMap.get(p.id) ?? {} }));
          segRows = segRows.filter((row: any) => companyFilters.every((f) => jsFilterSeg(f, row)));
        }

        // Opp JS enrichment + filter
        if (oppFilters.length > 0 && segRows.length > 0) {
          const pids = segRows.map((p: any) => p.id);
          const opps: any[] = [];
          for (let i = 0; i < pids.length; i += 200) {
            const { data } = await sb.from("opportunities")
              .select("contact_person_id, stage, pipeline, source, priority")
              .eq("tenant_id", tenantId)
              .in("contact_person_id", pids.slice(i, i + 200));
            opps.push(...(data ?? []));
          }
          const oppMap = new Map(opps.map((o: any) => [o.contact_person_id, o]));
          segRows = segRows.map((p: any) => ({ ...p, opp: oppMap.get(p.id) ?? {} }));
          segRows = segRows.filter((row: any) => oppFilters.every((f) => jsFilterSeg(f, row)));
        }

        recipientPersonIds = segRows.map((p: any) => p.id);
      }
    }
  }

  if (recipientPersonIds.length === 0) {
    return { ok: false, error: "No recipients found for this campaign", httpStatus: 400 };
  }

  // ── Resolve person details ───────────────────────────────────────────────────
  // Segment audiences already fetched full person rows in segRows — reuse them
  // to avoid a .in("id", largeArray) re-fetch that fails silently for 200+ UUIDs.
  // List/manual audiences need a chunk fetch (use 100 per chunk, safely under the limit).
  type PersonData = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    household_id: string | null;
  };

  let allPeople: PersonData[];

  if (campaign.audience_type === "segment") {
    allPeople = (segRows as PersonData[]).filter((p) => p.email);
  } else {
    allPeople = [];
    for (let i = 0; i < recipientPersonIds.length; i += 100) {
      const chunk = recipientPersonIds.slice(i, i + 100);
      const { data } = await sb
        .from("people")
        .select("id, first_name, last_name, email, household_id, tenant_people!inner(tenant_id)")
        .eq("tenant_people.tenant_id", tenantId)
        .in("id", chunk)
        .not("email", "is", null)
        .neq("email", "");
      allPeople.push(...(data ?? []));
    }
  }

  // ── Suppress unsubscribes ────────────────────────────────────────────────────
  const { data: unsubRows } = await sb
    .from("email_unsubscribes")
    .select("email_address")
    .eq("tenant_id", tenantId);

  const unsubEmails = new Set(
    (unsubRows ?? []).map((u: any) => u.email_address.toLowerCase())
  );

  const eligible = allPeople.filter(
    (p) => p.email && !unsubEmails.has(p.email.toLowerCase())
  );

  if (allPeople.length === 0) {
    return { ok: false, error: "No recipients have an email address on file. Add emails to your contacts and try again.", httpStatus: 400 };
  }

  if (eligible.length === 0) {
    return { ok: false, error: `All ${allPeople.length} recipient${allPeople.length !== 1 ? "s" : ""} are on the suppression list. If this is unexpected, go to Dispatch → Settings → Suppression List to review.`, httpStatus: 400 };
  }

  // ── Fetch location data for City/State merge tags ────────────────────────────
  const householdIds = [
    ...new Set(eligible.map((p) => p.household_id).filter(Boolean)),
  ] as string[];
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

  // ── Build click map for trackable links ──────────────────────────────────────
  const trackableUrl = (campaign.design_json as any)?.trackable_link_url ?? "";
  const clickMap: Record<string, string> = {};
  if (trackableUrl) {
    const hash = urlHash(trackableUrl);
    clickMap[hash] = trackableUrl;
    await sb
      .from("email_campaigns")
      .update({ design_json: { ...(campaign.design_json as object), click_map: clickMap } })
      .eq("id", campaignId);
  }

  // ── Mark campaign as sending ─────────────────────────────────────────────────
  await sb
    .from("email_campaigns")
    .update({ status: "sending", audience_count: eligible.length })
    .eq("id", campaignId);

  // ── Insert send rows as queued ───────────────────────────────────────────────
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
  const sendByPersonId = new Map(sends.map((s: any) => [s.person_id, s.id]));

  // ── Send via Resend ──────────────────────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_DISPATCH_API_KEY);
  const fromField = `${campaign.from_name} <${campaign.from_email}>`;

  let sentCount = 0;
  let failedCount = 0;

  for (const person of eligible) {
    const sendId = sendByPersonId.get(person.id);
    if (!sendId) continue;

    const loc = person.household_id
      ? (locationMap.get(person.household_id) ?? { city: "", state: "" })
      : { city: "", state: "" };

    let html = mergeHtml(campaign.html_body, {
      send_id: sendId,
      person_id: person.id,
      first_name: person.first_name ?? "",
      last_name: person.last_name ?? "",
      email: person.email ?? "",
      city: loc.city,
      state: loc.state,
    });

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
        await sb.from("email_sends").update({ status: "failed" }).eq("id", sendId);
        failedCount++;
      } else {
        await sb
          .from("email_sends")
          .update({ status: "sent", sent_at: new Date().toISOString(), resend_message_id: sent!.id })
          .eq("id", sendId);
        sentCount++;
      }
    } catch {
      await sb.from("email_sends").update({ status: "failed" }).eq("id", sendId);
      failedCount++;
    }

    // Rate limit: ~2 req/sec on Resend paid plan
    if (sentCount % 2 === 0) {
      await sleep(1000);
    }
  }

  // ── Mark campaign as sent ────────────────────────────────────────────────────
  await sb
    .from("email_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", campaignId);

  return { ok: true, sent: sentCount, failed: failedCount };
}
