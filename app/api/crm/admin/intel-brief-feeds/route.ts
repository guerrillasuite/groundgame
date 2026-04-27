import { getCrmUser } from "@/lib/crm-auth";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function requireSuperAdmin() {
  const user = await getCrmUser();
  if (!user?.isSuperAdmin) return null;
  return user;
}

export async function GET() {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sb = makeSb();
  const { data, error } = await sb.from("alert_feeds").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, feed_url, tenant_id } = await req.json();
  if (!name || !feed_url) return NextResponse.json({ error: "name and feed_url required" }, { status: 400 });
  const sb = makeSb();
  const { data, error } = await sb.from("alert_feeds").insert({ name, feed_url, tenant_id: tenant_id || null }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sb = makeSb();
  const { error } = await sb.from("alert_feeds").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
