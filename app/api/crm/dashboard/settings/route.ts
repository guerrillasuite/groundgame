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

export const DEFAULT_DASHBOARD_CONFIG = {
  admin_widgets: {
    pipeline:         true,
    active_lists:     true,
    survey_progress:  true,
    recent_activity:  true,
    sitrep:           true,
    intel_brief:      true,
  },
  field_kpi_ids: ["my_stops_today", "my_lists", "my_past_due", "contacts_reached_today", "active_ops"] as string[],
  field_widgets: {
    my_lists:      true,
    sitrep:        true,
    recent_stops:  true,
  },
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

  const saved = (data as any).settings?.dashboard_config ?? {};
  const result = {
    admin_widgets: { ...DEFAULT_DASHBOARD_CONFIG.admin_widgets, ...(saved.admin_widgets ?? {}) },
    field_kpi_ids: saved.field_kpi_ids ?? DEFAULT_DASHBOARD_CONFIG.field_kpi_ids,
    field_widgets: { ...DEFAULT_DASHBOARD_CONFIG.field_widgets, ...(saved.field_widgets ?? {}) },
  };
  return NextResponse.json(result);
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
  const current = currentSettings.dashboard_config ?? {};

  const merged: typeof DEFAULT_DASHBOARD_CONFIG = {
    admin_widgets: { ...DEFAULT_DASHBOARD_CONFIG.admin_widgets, ...(current.admin_widgets ?? {}) },
    field_kpi_ids: current.field_kpi_ids ?? DEFAULT_DASHBOARD_CONFIG.field_kpi_ids,
    field_widgets: { ...DEFAULT_DASHBOARD_CONFIG.field_widgets, ...(current.field_widgets ?? {}) },
  };

  if (body.admin_widgets && typeof body.admin_widgets === "object") {
    const aw = body.admin_widgets as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_DASHBOARD_CONFIG.admin_widgets) as Array<keyof typeof DEFAULT_DASHBOARD_CONFIG.admin_widgets>) {
      if (typeof aw[key] === "boolean") merged.admin_widgets[key] = aw[key] as boolean;
    }
  }
  if (Array.isArray(body.field_kpi_ids)) {
    merged.field_kpi_ids = (body.field_kpi_ids as string[]).slice(0, 5);
  }
  if (body.field_widgets && typeof body.field_widgets === "object") {
    const fw = body.field_widgets as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_DASHBOARD_CONFIG.field_widgets) as Array<keyof typeof DEFAULT_DASHBOARD_CONFIG.field_widgets>) {
      if (typeof fw[key] === "boolean") merged.field_widgets[key] = fw[key] as boolean;
    }
  }

  const { error } = await sb
    .from("tenants")
    .update({ settings: { ...currentSettings, dashboard_config: merged } })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(merged);
}
