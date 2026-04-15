import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "name", "subject", "preview_text", "from_name", "from_email", "reply_to",
  "design_json", "html_body", "status",
  "audience_type", "audience_list_id", "audience_segment_filters", "audience_person_ids",
  "scheduled_at", "audience_count",
] as const;

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function pickAllowed(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) result[key] = body[key];
  }
  return result;
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: campaignId } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const fields = pickAllowed(body);

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("email_campaigns")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("tenant_id", tenant.id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: campaignId } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);

  // Only allow deleting drafts
  const { data: campaign } = await sb
    .from("email_campaigns")
    .select("status")
    .eq("id", campaignId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be deleted" }, { status: 400 });
  }

  const { error } = await sb
    .from("email_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
