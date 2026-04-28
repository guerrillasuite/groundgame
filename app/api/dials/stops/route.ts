import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(req: NextRequest) {
  try {
  const body = await req.json().catch(() => null);
  if (!body?.walklist_id || !body?.result) {
    return NextResponse.json(
      { error: "walklist_id and result are required" },
      { status: 400 }
    );
  }

  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  // Optional person info update
  if (body.person_update?.id) {
    const pu = body.person_update;
    await sb.rpc("gs_update_person_v1", {
      _tenant_id: tenantId,
      _person: {
        id: pu.id,
        first_name: pu.first_name ?? null,
        last_name: pu.last_name ?? null,
        occupation: pu.occupation ?? null,
        employer: pu.employer ?? null,
        phone: pu.phone ?? null,
        email: pu.email ?? null,
      },
    }).catch(() => {}); // Non-fatal — person update is best-effort
  }

  // Create stop
  const { data: stopRows, error: stopErr } = await sb.rpc("gs_create_stop_v2", {
    _tenant_id: tenantId,
    _payload: {
      tenant_id: tenantId,
      walklist_id: body.walklist_id,
      walklist_item_id: body.walklist_item_id ?? null,
      person_id: body.person_id ?? null,
      user_id: body.user_id ?? null,
      channel: "call",
      result: body.result,
      notes: body.notes ?? null,
      duration_sec: body.duration_sec ?? 0,
    },
  });

  if (stopErr) {
    return NextResponse.json({ error: stopErr.message }, { status: 500 });
  }

  const stopId =
    (Array.isArray(stopRows) ? stopRows[0]?.stop_id ?? stopRows[0]?.id : (stopRows as any)?.stop_id ?? (stopRows as any)?.id) ||
    null;

  // Optional opportunity
  if (stopId && body.opportunity && (body.result === "contact_made" || body.result === "connected" || body.result === "follow_up")) {
    const opp = body.opportunity;
    await sb.rpc("gs_create_opportunity_v2", {
      _tenant_id: tenantId,
      _payload: {
        stop_id: stopId,
        contact_person_id: body.person_id ?? null,
        title: opp.title ?? "Call contact",
        stage: opp.stage ?? "new",
        amount_cents: opp.amount_cents ?? null,
        due_at: opp.due_at ?? null,
        priority: opp.priority ?? null,
        description: opp.description ?? null,
        source: "dials",
      },
    }).catch(() => {}); // Non-fatal
  }

  return NextResponse.json({ ok: true, stop_id: stopId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
