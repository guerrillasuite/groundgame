import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { ALL_FEATURE_KEYS, type FeatureKey } from "@/lib/features";

export const dynamic = "force-dynamic";

// Features that cannot be toggled by tenant self-service
const LOCKED_FEATURES: FeatureKey[] = ["crm_survey_branding", "crm_enrichment"];

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
    .from("tenants")
    .select("id, name, features, branding, settings")
    .eq("id", tenant.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Fetch contact types + stages for pipeline visibility
  const { data: ctRows } = await sb
    .from("tenant_contact_types")
    .select("key, label, order_index")
    .eq("tenant_id", tenant.id)
    .order("order_index");

  const { data: stageRows } = await sb
    .from("opportunity_stages")
    .select("key, label, order_index, contact_type_key")
    .eq("tenant_id", tenant.id)
    .order("order_index");

  const stagesByType: Record<string, { key: string; label: string }[]> = {};
  for (const s of (stageRows ?? []) as any[]) {
    if (!stagesByType[s.contact_type_key]) stagesByType[s.contact_type_key] = [];
    stagesByType[s.contact_type_key].push({ key: s.key, label: s.label });
  }

  const contactTypes = (ctRows ?? []).map((ct: any) => ({
    key: ct.key,
    label: ct.label,
    stages: stagesByType[ct.key] ?? [],
  }));

  return NextResponse.json({
    id: (data as any).id,
    name: (data as any).name,
    features: ((data as any).features as FeatureKey[]) ?? [...ALL_FEATURE_KEYS],
    branding: ((data as any).branding as Record<string, unknown>) ?? {},
    settings: ((data as any).settings as Record<string, unknown>) ?? {},
    contactTypes,
  });
}

export async function PUT(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  let body: { name?: string; features?: string[]; branding?: Record<string, unknown>; settings?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    patch.name = body.name.trim();
  }

  if (body.features !== undefined) {
    // Validate keys + strip locked features
    const valid = body.features.filter(
      (f) => ALL_FEATURE_KEYS.includes(f as FeatureKey) && !LOCKED_FEATURES.includes(f as FeatureKey)
    ) as FeatureKey[];
    patch.features = valid;
  }

  if (body.branding !== undefined) patch.branding = body.branding;
  if (body.settings !== undefined) patch.settings = body.settings;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await sb
    .from("tenants")
    .update(patch)
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
