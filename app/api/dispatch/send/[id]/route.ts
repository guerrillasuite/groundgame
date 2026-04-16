import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { sendCampaign } from "@/lib/dispatch/sendCampaign";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: campaignId } = await params;

  // ── Cron bypass: trusted internal call from /api/cron/dispatch ────────────────
  const incomingCronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = process.env.CRON_SECRET;
  const isCronCall = expectedCronSecret && incomingCronSecret === expectedCronSecret;

  let tenantId: string;
  if (isCronCall) {
    const headerTenantId = req.headers.get("x-tenant-id");
    if (!headerTenantId) {
      return NextResponse.json({ error: "Missing x-tenant-id" }, { status: 400 });
    }
    tenantId = headerTenantId;
  } else {
    const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
    if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    tenantId = tenant.id;
  }

  const result = await sendCampaign(tenantId, campaignId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed });
}
