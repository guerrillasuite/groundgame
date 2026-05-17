import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function displayFor(l: any): string {
  const name = (l.place_name ?? l.common_place_name ?? "").trim();
  const nk   = (l.full_address ?? l.normalized_key ?? "").trim();
  const addr  = nk || [l.address_line1, [l.city, l.state].filter(Boolean).join(", "), l.postal_code].filter(Boolean).join(", ");
  if (name && name !== addr) return `${name} — ${addr}`;
  return addr || name || l.id;
}

// GET /api/sitrep/locations?tenantId=xxx&q=search   → [{ id, display }]
// GET /api/sitrep/locations?tenantId=xxx&id=uuid    → { id, display }
export async function GET(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url      = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "";
  const q        = (url.searchParams.get("q") ?? "").trim();
  const singleId = url.searchParams.get("id") ?? "";

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const sb = makeAdminSb();

  // Single lookup by ID
  if (singleId) {
    const { data } = await sb
      .from("locations")
      .select("id, place_name, common_place_name, full_address, normalized_key, address_line1, city, state, postal_code")
      .eq("id", singleId)
      .single();
    if (!data) return NextResponse.json(null);
    return NextResponse.json({ id: data.id, display: displayFor(data) });
  }

  // Search
  if (!q || q.length < 2) return NextResponse.json([]);

  const { data } = await sb
    .from("locations")
    .select("id, place_name, common_place_name, full_address, normalized_key, address_line1, city, state, postal_code")
    .eq("tenant_id", tenantId)
    .or(`full_address.ilike.%${q}%,place_name.ilike.%${q}%,common_place_name.ilike.%${q}%,address_line1.ilike.%${q}%`)
    .limit(10);

  const qLow   = q.toLowerCase();
  const ranked = (data ?? []).sort((a: any, b: any) => {
    const score = (r: any) =>
      (r.place_name?.toLowerCase().includes(qLow) ? 2 : 0) +
      (r.common_place_name?.toLowerCase().includes(qLow) ? 1 : 0);
    return score(b) - score(a);
  });

  return NextResponse.json(ranked.map((l: any) => ({ id: l.id, display: displayFor(l) })));
}
