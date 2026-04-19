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

export const DEFAULT_WIDGET = {
  show_types:  [] as string[],
  sort_by:     "due_date" as "due_date" | "start_at" | "priority" | "created_at",
  sort_dir:    "asc"      as "asc" | "desc",
  group_by:    "none"     as "none" | "type" | "status" | "priority",
  max_items:   10         as number,
};

export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("tenants")
    .select("settings")
    .eq("id", tenant.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const saved = (data as any).settings?.sitrep_widget ?? {};
  return NextResponse.json({ ...DEFAULT_WIDGET, ...saved });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: tenantData, error: fetchErr } = await sb
    .from("tenants")
    .select("settings")
    .eq("id", tenant.id)
    .single();

  if (fetchErr || !tenantData) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const currentSettings = (tenantData as any).settings ?? {};
  const merged = { ...DEFAULT_WIDGET, ...(currentSettings.sitrep_widget ?? {}) };

  if (Array.isArray(body.show_types)) merged.show_types = body.show_types as string[];
  if (["due_date", "start_at", "priority", "created_at"].includes(body.sort_by as string))
    merged.sort_by = body.sort_by as typeof merged.sort_by;
  if (["asc", "desc"].includes(body.sort_dir as string))
    merged.sort_dir = body.sort_dir as typeof merged.sort_dir;
  if (["none", "type", "status", "priority"].includes(body.group_by as string))
    merged.group_by = body.group_by as typeof merged.group_by;
  if (typeof body.max_items === "number" && [5, 8, 10, 15, 20].includes(body.max_items))
    merged.max_items = body.max_items;

  const { error } = await sb
    .from("tenants")
    .update({ settings: { ...currentSettings, sitrep_widget: merged } })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(merged);
}
