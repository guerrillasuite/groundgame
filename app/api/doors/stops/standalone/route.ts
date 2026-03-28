import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { findOrCreateLocation, findOrCreateHousehold } from "@/lib/crm/location-utils";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const body = await req.json().catch(() => null);
  if (!body?.result) {
    return NextResponse.json({ error: "result is required" }, { status: 400 });
  }

  const {
    channel = "doors",
    address_line1,
    city,
    state,
    postal_code,
    person_id: rawPersonId = null,
    new_person = null,
    result,
    notes = null,
    opportunity = null,
  } = body as {
    channel?: "doors" | "call";
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    person_id?: string | null;
    new_person?: { first_name: string; last_name?: string | null; phone?: string | null } | null;
    result: string;
    notes?: string | null;
    opportunity?: {
      title?: string;
      stage?: string;
      amount_cents?: number | null;
      due_at?: string | null;
      priority?: string | null;
      description?: string | null;
    } | null;
  };

  // Create person inline if requested
  let person_id = rawPersonId;
  if (!person_id && new_person?.first_name) {
    const { data: np } = await sb
      .from("people")
      .insert({ first_name: new_person.first_name, last_name: new_person.last_name ?? null, phone: new_person.phone ?? null, tenant_id: tenantId })
      .select("id").single();
    if (np?.id) {
      person_id = np.id;
      await sb.from("tenant_people").insert({ person_id: np.id, tenant_id: tenantId });
    }
  }

  let locationId: string | null = null;

  // Resolve location from address if provided
  if (address_line1?.trim()) {
    try {
      const { id } = await findOrCreateLocation(sb, tenantId, {
        address_line1,
        city,
        state,
        postal_code,
      });
      locationId = id;
      // Ensure household exists at this location
      await findOrCreateHousehold(sb, tenantId, id, address_line1.trim());
    } catch (err: any) {
      return NextResponse.json({ error: `Location error: ${err.message}` }, { status: 500 });
    }
  }

  // Insert the stop directly
  const { data: stopRow, error: stopErr } = await sb
    .from("stops")
    .insert({
      tenant_id: tenantId,
      channel,
      result,
      notes: notes || null,
      location_id: locationId,
      person_id: person_id || null,
      walklist_id: null,
      walklist_item_id: null,
    })
    .select("id")
    .single();

  if (stopErr || !stopRow) {
    // Fall back to RPC if direct insert fails (e.g. RLS or missing columns)
    try {
      const { data: rpcRows, error: rpcErr } = await sb.rpc("gs_create_stop_v2", {
        _tenant_id: tenantId,
        _payload: {
          tenant_id: tenantId,
          walklist_id: null,
          walklist_item_id: null,
          person_id: person_id ?? null,
          user_id: null,
          channel,
          result,
          notes: notes ?? null,
          duration_sec: 0,
          location_id: locationId,
        },
      });
      if (rpcErr) throw rpcErr;
      const stopId = (Array.isArray(rpcRows) ? rpcRows[0]?.stop_id : (rpcRows as any)?.stop_id) || null;
      return await createOpportunityAndReturn(sb, tenantId, stopId, person_id, result, opportunity);
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? "Failed to create stop" }, { status: 500 });
    }
  }

  const stopId = stopRow.id;
  return await createOpportunityAndReturn(sb, tenantId, stopId, person_id, result, opportunity);
}

async function createOpportunityAndReturn(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  stopId: string | null,
  personId: string | null | undefined,
  result: string,
  opportunity: any
) {
  if (
    stopId &&
    opportunity &&
    (result === "contact_made" || result === "connected" || result === "follow_up")
  ) {
    try {
      await sb.rpc("gs_create_opportunity_v2", {
        _tenant_id: tenantId,
        _payload: {
          stop_id: stopId,
          contact_person_id: personId ?? null,
          title: opportunity.title ?? "Follow-up",
          stage: opportunity.stage ?? "new",
          amount_cents: opportunity.amount_cents ?? null,
          due_at: opportunity.due_at ?? null,
          priority: opportunity.priority ?? null,
          description: opportunity.description ?? null,
          source: "standalone",
        },
      });
    } catch {
      // Non-fatal — stop already created
    }
  }

  return NextResponse.json({ ok: true, stop_id: stopId });
}
