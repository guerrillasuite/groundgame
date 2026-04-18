import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_public_calendars")
    .select("id, name, token, include_type_slugs, include_statuses, show_day, show_week, show_month, default_view, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_public_calendars")
    .insert({
      tenant_id:           tenant.id,
      name:                body.name.trim(),
      include_type_slugs:  body.include_type_slugs ?? [],
      include_statuses:    body.include_statuses ?? ["open", "confirmed"],
      show_day:            body.show_day ?? true,
      show_week:           body.show_week ?? true,
      show_month:          body.show_month ?? true,
      default_view:        body.default_view ?? "month",
    })
    .select("id, name, token, include_type_slugs, include_statuses, show_day, show_week, show_month, default_view, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
