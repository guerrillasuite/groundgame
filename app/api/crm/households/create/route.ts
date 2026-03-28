import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { findOrCreateLocation } from "@/lib/crm/location-utils";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const body = await req.json().catch(() => null);
  const { address_line1, city, state, postal_code, name } = body ?? {};

  if (!address_line1?.trim()) {
    return NextResponse.json({ error: "address_line1 is required" }, { status: 400 });
  }

  // Find or create location
  const loc = await findOrCreateLocation(sb, tenantId, { address_line1, city, state, postal_code });

  // Check if a household already exists at this location
  const { data: existing } = await sb
    .from("households")
    .select("id")
    .eq("location_id", loc.id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: (existing as any).id, created: false });
  }

  const { data: newHH, error } = await sb
    .from("households")
    .insert({
      tenant_id: tenantId,
      location_id: loc.id,
      name: name?.trim() || address_line1.trim(),
    })
    .select("id")
    .single();

  if (error || !newHH) {
    return NextResponse.json({ error: error?.message ?? "Failed to create household" }, { status: 500 });
  }

  return NextResponse.json({ id: (newHH as any).id, created: true });
}
