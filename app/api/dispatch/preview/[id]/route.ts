import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.guerrillasuite.com";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id: campaignId } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { data: campaign } = await sb
    .from("email_campaigns")
    .select("html_body")
    .eq("id", campaignId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!campaign?.html_body) {
    return NextResponse.json({ error: "Campaign not found or no HTML body" }, { status: 404 });
  }

  // Replace merge tags with example data for preview
  const preview = campaign.html_body
    .replace(/\{First_Name\}/g, "Jane")
    .replace(/\{Last_Name\}/g, "Smith")
    .replace(/\{Full_Name\}/g, "Jane Smith")
    .replace(/\{Email\}/g, "jane@example.com")
    .replace(/\{City\}/g, "Austin")
    .replace(/\{State\}/g, "TX")
    .replace(/\{Unsubscribe_Link\}/g, `${APP_URL}/unsubscribe/preview`)
    .replace(/\{Trackable_Link_URL\}/g, "#");

  return new NextResponse(preview, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
