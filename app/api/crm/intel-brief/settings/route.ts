import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb();
  const { data } = await sb
    .from("tenant_news_settings")
    .select("*")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function PUT(req: Request) {
  const user = await getCrmUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenant = await getTenant();
  const body = await req.json();

  const allowed = ["keywords", "display_threshold", "widget_count", "news_feed_enabled_for_field", "blacklisted_domains", "categories"];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const sb = makeSb();
  const { error } = await sb
    .from("tenant_news_settings")
    .upsert({ tenant_id: tenant.id, ...patch }, { onConflict: "tenant_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
