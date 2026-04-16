import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";
import { resolveDispoConfig } from "@/lib/dispositionConfig";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// GET /api/crm/settings/dispositions
export async function GET() {
  const tenant = await getTenant();
  const config = resolveDispoConfig(tenant.settings);
  return NextResponse.json(config);
}

// PUT /api/crm/settings/dispositions
export async function PUT(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body?.doors || !body?.calls) {
    return NextResponse.json({ error: "doors and calls are required" }, { status: 400 });
  }

  // Basic validation
  for (const channel of ["doors", "calls"] as const) {
    for (const item of body[channel]) {
      if (typeof item.key !== "string" || !item.key) {
        return NextResponse.json({ error: "Each item must have a key" }, { status: 400 });
      }
      if (item.color && !HEX_RE.test(item.color)) {
        return NextResponse.json(
          { error: `Invalid color for ${item.key}: ${item.color}` },
          { status: 400 }
        );
      }
    }
  }

  // Read existing settings, merge in new dispositionConfig
  const { data: tenantRow } = await sb
    .from("tenants")
    .select("settings")
    .eq("id", tenant.id)
    .single();

  const existingSettings = (tenantRow as any)?.settings ?? {};
  const newSettings = { ...existingSettings, dispositionConfig: body };

  const { error } = await sb
    .from("tenants")
    .update({ settings: newSettings })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
