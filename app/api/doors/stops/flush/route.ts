import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { getPendingStops, markStopSynced, markStopError } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

export async function POST() {
  const { id: tenantId } = await getTenant();
  const supabase = getSupabaseServer({ writable: true });
  const pending = getPendingStops();

  let synced = 0;
  let failed = 0;

  for (const stop of pending) {
    try {
      const { data: stopRows, error: stopErr } = await supabase.rpc("gs_create_stop_v2", {
        _tenant_id: tenantId,
        _payload: {
          tenant_id: tenantId,
          walklist_id: stop.walklist_id,
          walklist_item_id: stop.item_id,
          person_id: stop.person_id ?? null,
          user_id: null,
          channel: "doors",
          result: stop.result,
          notes: stop.notes ?? null,
          duration_sec: 0,
        },
      });

      if (stopErr) throw stopErr;

      const stopId =
        (Array.isArray(stopRows) ? stopRows[0]?.stop_id : (stopRows as any)?.stop_id) ||
        null;

      await supabase.rpc("gs_update_walklist_progress_v1", {
        _tenant_id: tenantId,
        _walklist_id: stop.walklist_id,
        _walklist_item_id: stop.item_id,
        _last_index: 0,
        _mark_visited: true,
      });

      if (stopId && (stop.result === "contact_made" || stop.result === "follow_up")) {
        await supabase.rpc("gs_create_opportunity_v2", {
          _tenant_id: tenantId,
          _payload: {
            stop_id: stopId,
            contact_person_id: stop.person_id ?? null,
            title: stop.result === "follow_up" ? "Follow up from door" : "Door contact",
            stage: "new",
            amount_cents: null,
            due_at: null,
            priority: stop.result === "follow_up" ? "high" : null,
            description: stop.notes ?? null,
            source: "doors",
          },
        });
      }

      markStopSynced(stop.id);
      synced++;
    } catch (e: any) {
      markStopError(stop.id, String(e?.message ?? e));
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, total: pending.length });
}
