import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// GET /api/crm/reminders
// Query params: status, assigned_to_me (bool), person_id, household_id, opportunity_id
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { searchParams } = new URL(req.url);

  let query = sb
    .from("reminders")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("due_at", { ascending: true });

  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);

  const personId = searchParams.get("person_id");
  if (personId) query = query.eq("person_id", personId);

  const householdId = searchParams.get("household_id");
  if (householdId) query = query.eq("household_id", householdId);

  const opportunityId = searchParams.get("opportunity_id");
  if (opportunityId) query = query.eq("opportunity_id", opportunityId);

  const assignedToMe = searchParams.get("assigned_to_me");
  if (assignedToMe === "true") {
    const crmUser = await getCrmUser();
    if (crmUser) query = query.eq("assigned_to_user_id", crmUser.userId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/crm/reminders
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const crmUser = await getCrmUser();

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim() || !body?.due_at) {
    return NextResponse.json({ error: "title and due_at are required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("reminders")
    .insert({
      tenant_id: tenant.id,
      type: body.type ?? "custom",
      title: body.title.trim(),
      notes: body.notes ?? null,
      due_at: body.due_at,
      assigned_to_user_id: body.assigned_to_user_id ?? crmUser?.userId ?? null,
      created_by_user_id: crmUser?.userId ?? null,
      person_id: body.person_id ?? null,
      household_id: body.household_id ?? null,
      opportunity_id: body.opportunity_id ?? null,
      stop_id: body.stop_id ?? null,
      walklist_item_id: body.walklist_item_id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create reminder" }, { status: 500 });
  }

  return NextResponse.json({ id: (data as any).id, created: true });
}
