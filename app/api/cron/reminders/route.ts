import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { reminderEmail, staleOpportunityEmail } from "@/lib/email/reminderTemplates";
import type { Reminder } from "@/lib/types/reminder";

export const dynamic = "force-dynamic";

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeAdminSb() {
  return createClient(SB_URL(), SERVICE_KEY());
}

const SB_HEADERS = () => ({
  Authorization: `Bearer ${SERVICE_KEY()}`,
  apikey: SERVICE_KEY(),
});

async function getUserEmail(userId: string): Promise<{ email: string; name: string } | null> {
  try {
    const r = await fetch(`${SB_URL()}/auth/v1/admin/users/${userId}`, { headers: SB_HEADERS() });
    if (!r.ok) return null;
    const u = await r.json();
    return {
      email: u.email ?? "",
      name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? userId,
    };
  } catch {
    return null;
  }
}

const APP_URL =
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://app.guerrillasuite.com";

// Build a human-readable record name + URL for the reminder email
async function resolveLinkedRecord(
  reminder: Reminder,
  sb: ReturnType<typeof createClient<any>>
): Promise<{ name: string | null; url: string | null }> {
  if (reminder.opportunity_id) {
    const { data } = await sb
      .from("opportunities")
      .select("title")
      .eq("id", reminder.opportunity_id)
      .single();
    return {
      name: (data as any)?.title ?? "Opportunity",
      url: `${APP_URL}/crm/opportunities/${reminder.opportunity_id}`,
    };
  }
  if (reminder.person_id) {
    const { data } = await sb
      .from("people")
      .select("first_name,last_name")
      .eq("id", reminder.person_id)
      .single();
    const name = data ? `${(data as any).first_name ?? ""} ${(data as any).last_name ?? ""}`.trim() : "Contact";
    return { name, url: `${APP_URL}/crm/people/${reminder.person_id}` };
  }
  if (reminder.household_id) {
    const { data } = await sb
      .from("households")
      .select("name")
      .eq("id", reminder.household_id)
      .single();
    return {
      name: (data as any)?.name ?? "Household",
      url: `${APP_URL}/crm/households/${reminder.household_id}`,
    };
  }
  return { name: null, url: null };
}

export async function POST(req: NextRequest) {
  // Auth check
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const adminSb = makeAdminSb();
  let processed = 0;
  let staleAlerts = 0;
  const errors: string[] = [];

  // ── Step 1: Send due reminders ───────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data: dueReminders, error: remErr } = await adminSb
    .from("reminders")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", now);

  if (remErr) {
    errors.push(`reminders query: ${remErr.message}`);
  } else {
    for (const row of (dueReminders ?? []) as Reminder[]) {
      try {
        const assignee = row.assigned_to_user_id
          ? await getUserEmail(row.assigned_to_user_id)
          : null;

        if (!assignee?.email) {
          // Mark sent anyway so it doesn't keep firing
          await adminSb
            .from("reminders")
            .update({ status: "sent", sent_at: now })
            .eq("id", row.id);
          continue;
        }

        // Need a tenant-scoped client to query linked records
        const tenantSb = createClient(SB_URL(), SERVICE_KEY(), {
          global: { headers: { "X-Tenant-Id": row.tenant_id } },
        });
        const { name: recordName, url: recordUrl } = await resolveLinkedRecord(row, tenantSb);

        const { subject, html } = reminderEmail(row, assignee.name, recordName, recordUrl);
        await sendEmail(assignee.email, subject, html);

        await adminSb
          .from("reminders")
          .update({ status: "sent", sent_at: now, updated_at: now })
          .eq("id", row.id);

        processed++;
      } catch (e: any) {
        errors.push(`reminder ${row.id}: ${e.message}`);
      }
    }
  }

  // ── Step 2: Stale opportunity alerts ─────────────────────────────────────────
  const staleThresholdDays = 7;
  const staleCutoff = new Date(Date.now() - staleThresholdDays * 86400_000).toISOString();
  const alertWindow = new Date(Date.now() - 86400_000).toISOString(); // 24h dedup window

  // Get all tenants with active opportunities
  const { data: staleOpps } = await adminSb
    .from("opportunities")
    .select("id,title,tenant_id,updated_at")
    .not("stage", "in", '("won","lost","closed")')
    .lt("updated_at", staleCutoff);

  for (const opp of (staleOpps ?? []) as any[]) {
    try {
      // Dedup: skip if we already sent a stale alert for this opp in the last 24h
      const { data: recent } = await adminSb
        .from("reminders")
        .select("id")
        .eq("opportunity_id", opp.id)
        .eq("type", "opportunity_stale")
        .eq("status", "sent")
        .gte("sent_at", alertWindow)
        .limit(1);
      if (recent && recent.length > 0) continue;

      // Get assigned users for this opportunity
      const { data: oppUsers } = await adminSb
        .from("opportunity_users")
        .select("user_id")
        .eq("opportunity_id", opp.id)
        .eq("tenant_id", opp.tenant_id);

      const userIds = (oppUsers ?? []).map((u: any) => u.user_id as string);
      if (userIds.length === 0) continue;

      const daysSince = Math.floor(
        (Date.now() - new Date(opp.updated_at).getTime()) / 86400_000
      );

      for (const userId of userIds) {
        const user = await getUserEmail(userId);
        if (!user?.email) continue;

        const { subject, html } = staleOpportunityEmail(
          opp.title,
          opp.id,
          daysSince,
          user.name,
          APP_URL
        );
        await sendEmail(user.email, subject, html);
        staleAlerts++;
      }

      // Record that we sent the alert (prevents re-alerting within 24h)
      await adminSb.from("reminders").insert({
        tenant_id: opp.tenant_id,
        type: "opportunity_stale",
        title: `Stale: ${opp.title}`,
        due_at: now,
        status: "sent",
        sent_at: now,
        opportunity_id: opp.id,
      });
    } catch (e: any) {
      errors.push(`stale opp ${opp.id}: ${e.message}`);
    }
  }

  return NextResponse.json({ processed, stale_alerts: staleAlerts, errors });
}
