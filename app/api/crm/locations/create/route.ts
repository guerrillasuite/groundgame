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
  const { address_line1, city, state, postal_code } = body ?? {};

  if (!address_line1?.trim()) {
    return NextResponse.json({ error: "address_line1 is required" }, { status: 400 });
  }

  const result = await findOrCreateLocation(sb, tenantId, { address_line1, city, state, postal_code });

  if (!result.created) {
    return NextResponse.json(
      { error: "Location already exists", existingId: result.id },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: result.id, created: true });
}
