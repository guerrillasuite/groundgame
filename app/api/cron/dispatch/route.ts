// app/api/cron/dispatch/route.ts
// Polls for scheduled campaigns whose scheduled_at has passed and fires them.
// Called every 5 minutes by a Railway cron service:
//   POST https://<any-tenant>.groundgame.digital/api/cron/dispatch
//   Authorization: Bearer $CRON_SECRET
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCampaign } from "@/lib/dispatch/sendCampaign";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function makeAdminSb() {
  // No X-Tenant-Id — service role key bypasses RLS so we see all tenants
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = makeAdminSb();
  const now = new Date().toISOString();

  // Find all scheduled campaigns whose send time has passed
  const { data: dueCampaigns, error } = await sb
    .from("email_campaigns")
    .select("id, tenant_id, name, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (error) {
    console.error("[cron/dispatch] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const campaigns = dueCampaigns ?? [];

  if (campaigns.length === 0) {
    return NextResponse.json({ fired: 0, results: [] });
  }

  console.log(`[cron/dispatch] Found ${campaigns.length} campaign(s) due to send`);

  const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];

  for (const campaign of campaigns as any[]) {
    console.log(`[cron/dispatch] Sending campaign ${campaign.id} (${campaign.name}) for tenant ${campaign.tenant_id}...`);
    const result = await sendCampaign(campaign.tenant_id, campaign.id);

    if (result.ok) {
      console.log(`[cron/dispatch] Sent campaign ${campaign.id}: sent=${result.sent}, failed=${result.failed}`);
      results.push({ id: campaign.id, name: campaign.name, ok: true });
    } else {
      console.error(`[cron/dispatch] Campaign ${campaign.id} failed: ${result.error}`);
      results.push({ id: campaign.id, name: campaign.name, ok: false, error: result.error });
    }
  }

  return NextResponse.json({
    fired: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
