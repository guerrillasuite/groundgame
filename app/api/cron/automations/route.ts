import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fireAutomations } from "@/lib/automations/engine";
import { todayStr, addDays } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// POST /api/cron/automations  (called by cron/dispatch.sh every 5 min)
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const adminSb  = makeAdminSb();
  const today    = todayStr();
  const now      = new Date();
  const nowUtc   = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const errors:  string[] = [];
  let processed = 0;
  let skipped   = 0;

  // Load all active cron-driven automations
  const { data: automations, error: autoErr } = await adminSb
    .from("sitrep_automations")
    .select("*")
    .eq("is_active", true)
    .in("trigger_type", ["item_overdue", "date_approaching", "scheduled_daily", "scheduled_weekly"]);

  if (autoErr) {
    return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }

  for (const auto of automations ?? []) {
    try {
      // ── scheduled_daily ────────────────────────────────────────────────────
      if (auto.trigger_type === "scheduled_daily") {
        const targetTime: string = auto.trigger_config?.time_utc ?? "08:00";
        // Fire if we're within the 5-min window of the target time
        if (!isWithin5Min(nowUtc, targetTime)) { skipped++; continue; }
        // Dedup: don't fire more than once per day (check last_run_at date)
        if (auto.last_run_at && auto.last_run_at.startsWith(today)) { skipped++; continue; }

        await fireAutomations({
          tenant_id:    auto.tenant_id,
          trigger_type: "scheduled_daily",
        });
        processed++;
        continue;
      }

      // ── scheduled_weekly ───────────────────────────────────────────────────
      if (auto.trigger_type === "scheduled_weekly") {
        const targetDay  = auto.trigger_config?.day_of_week ?? 1; // Monday default
        const targetTime = auto.trigger_config?.time_utc    ?? "08:00";
        if (now.getUTCDay() !== targetDay) { skipped++; continue; }
        if (!isWithin5Min(nowUtc, targetTime)) { skipped++; continue; }
        if (auto.last_run_at && auto.last_run_at.startsWith(today)) { skipped++; continue; }

        await fireAutomations({
          tenant_id:    auto.tenant_id,
          trigger_type: "scheduled_weekly",
        });
        processed++;
        continue;
      }

      // ── item_overdue ───────────────────────────────────────────────────────
      if (auto.trigger_type === "item_overdue") {
        let q = adminSb
          .from("sitrep_items")
          .select("*, sitrep_assignments(user_id, role)")
          .eq("tenant_id", auto.tenant_id)
          .eq("status", "open")
          .lt("due_date", today)
          .limit(200);
        if (auto.trigger_config?.item_type) q = q.eq("item_type", auto.trigger_config.item_type);
        if (auto.trigger_config?.priority)  q = q.eq("priority",  auto.trigger_config.priority);

        const { data: items } = await q;
        for (const item of items ?? []) {
          const alreadyFired = await checkDedup(adminSb, auto.id, item.id);
          if (alreadyFired) { skipped++; continue; }
          await fireAutomations({
            tenant_id:    auto.tenant_id,
            trigger_type: "item_overdue",
            item,
          });
          processed++;
        }
        continue;
      }

      // ── date_approaching ───────────────────────────────────────────────────
      if (auto.trigger_type === "date_approaching") {
        const daysBefore: number = auto.trigger_config?.days_before ?? 1;
        const targetDate = addDays(today, daysBefore);

        let q = adminSb
          .from("sitrep_items")
          .select("*, sitrep_assignments(user_id, role)")
          .eq("tenant_id", auto.tenant_id)
          .eq("status", "open")
          .eq("due_date", targetDate)
          .limit(200);
        if (auto.trigger_config?.item_type) q = q.eq("item_type", auto.trigger_config.item_type);

        const { data: items } = await q;
        for (const item of items ?? []) {
          const alreadyFired = await checkDedup(adminSb, auto.id, item.id);
          if (alreadyFired) { skipped++; continue; }
          await fireAutomations({
            tenant_id:    auto.tenant_id,
            trigger_type: "date_approaching",
            item,
          });
          processed++;
        }
        continue;
      }
    } catch (e: any) {
      errors.push(`automation ${auto.id}: ${e?.message ?? String(e)}`);
    }
  }

  return NextResponse.json({ processed, skipped, errors });
}

/** True if the current time (HH:MM UTC) is within 5 minutes of the target time */
function isWithin5Min(nowUtc: string, targetUtc: string): boolean {
  const [nh, nm] = nowUtc.split(":").map(Number);
  const [th, tm] = targetUtc.split(":").map(Number);
  const nowMins    = nh * 60 + nm;
  const targetMins = th * 60 + tm;
  return Math.abs(nowMins - targetMins) <= 5;
}

/** Check sitrep_automation_runs for a same automation+item within the last 23 hours */
async function checkDedup(
  adminSb: ReturnType<typeof makeAdminSb>,
  automationId: string,
  itemId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 23 * 3600_000).toISOString();
  const { data } = await adminSb
    .from("sitrep_automation_runs")
    .select("id")
    .eq("automation_id", automationId)
    .eq("item_id", itemId)
    .eq("status", "success")
    .gte("created_at", cutoff)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
