import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { markVisited, insertPendingStop, markStopSynced, markStopError } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.walklist_id || !body?.item_id || !body?.result) {
    return NextResponse.json(
      { error: "walklist_id, item_id, and result are required" },
      { status: 400 }
    );
  }

  const { id: tenantId } = await getTenant();

  // Optimistic local update
  markVisited(body.item_id, body.result);

  // Queue in SQLite (synced=0 by default)
  const pendingId = insertPendingStop({
    tenant_id: tenantId,
    walklist_id: body.walklist_id,
    item_id: body.item_id,
    person_id: body.person_id ?? null,
    result: body.result,
    notes: body.notes ?? null,
    photo_url: body.photo_url ?? null,
  });

  // Try Supabase sync immediately
  const supabase = getSupabaseServer({ writable: true });
  let stopId: string | null = null;

  try {
    const { data: stopRows, error: stopErr } = await supabase.rpc("gs_create_stop_v2", {
      _tenant_id: tenantId,
      _payload: {
        tenant_id: tenantId,
        walklist_id: body.walklist_id,
        walklist_item_id: body.item_id,
        person_id: body.person_id ?? null,
        user_id: null,
        channel: "door",
        result: body.result,
        notes: body.notes ?? null,
        duration_sec: 0,
      },
    });

    if (stopErr) throw stopErr;

    stopId =
      (Array.isArray(stopRows) ? stopRows[0]?.stop_id : (stopRows as any)?.stop_id) ||
      (Array.isArray(stopRows) ? stopRows[0]?.id : (stopRows as any)?.id) ||
      null;

    // Progress update
    await supabase.rpc("gs_update_walklist_progress_v1", {
      _tenant_id: tenantId,
      _walklist_id: body.walklist_id,
      _walklist_item_id: body.item_id,
      _last_index: body.idx ?? 0,
      _mark_visited: true,
    });

    // Create opportunity for meaningful contacts
    if (
      stopId &&
      (body.result === "contact_made" || body.result === "follow_up")
    ) {
      await supabase.rpc("gs_create_opportunity_v2", {
        _tenant_id: tenantId,
        _payload: {
          stop_id: stopId,
          contact_person_id: body.person_id ?? null,
          title: body.result === "follow_up" ? "Follow up from door" : "Door contact",
          stage: "new",
          amount_cents: null,
          due_at: null,
          priority: body.result === "follow_up" ? "high" : null,
          description: body.notes ?? null,
          source: "doors",
        },
      });
    }

    markStopSynced(pendingId);

    return NextResponse.json({ ok: true, stop_id: stopId, queued: false });
  } catch (e: any) {
    markStopError(pendingId, String(e?.message ?? e));
    // Still return ok=true since we queued it locally
    return NextResponse.json({ ok: true, stop_id: null, queued: true });
  }
}
