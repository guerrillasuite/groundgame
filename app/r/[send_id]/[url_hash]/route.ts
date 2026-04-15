import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type Params = { params: Promise<{ send_id: string; url_hash: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { send_id, url_hash } = await params;
  const sb = makeAdminSb();

  // Look up the send record and original URL from the campaign
  const { data: send } = await sb
    .from("email_sends")
    .select("id, person_id, tenant_id, campaign_id")
    .eq("id", send_id)
    .single();

  if (!send) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Resolve original URL from campaign's design_json click_map
  const { data: campaign } = await sb
    .from("email_campaigns")
    .select("design_json")
    .eq("id", send.campaign_id)
    .single();

  const clickMap = (campaign?.design_json as any)?.click_map ?? {};
  const originalUrl: string | undefined = clickMap[url_hash];

  // Log the click regardless (even if URL lookup fails)
  await sb.from("email_clicks").insert({
    campaign_id: send.campaign_id,
    send_id: send.id,
    person_id: send.person_id,
    tenant_id: send.tenant_id,
    original_url: originalUrl ?? url_hash,
    user_agent: req.headers.get("user-agent") ?? null,
    // Don't log IP — privacy
  });

  if (!originalUrl) {
    return new NextResponse("Link not found", { status: 404 });
  }

  // Permanent redirect to destination
  return NextResponse.redirect(originalUrl, { status: 302 });
}
