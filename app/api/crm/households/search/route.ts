import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function GET(request: Request) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  if (!q) return NextResponse.json({ rows: [], total: 0 });

  const like = `%${q}%`;

  const { data, count, error } = await sb
    .from("households")
    .select("id, name, location_id", { count: "exact" })
    .eq("tenant_id", tenant.id)
    .ilike("name", like)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Fetch addresses for the returned households
  const locIds = [...new Set(rows.map((h: any) => h.location_id).filter(Boolean))];
  const addressById = new Map<string, string>();

  if (locIds.length > 0) {
    const { data: locs } = await sb
      .from("locations")
      .select("id, normalized_key, address_line1, city, state, postal_code")
      .in("id", locIds);

    for (const l of locs ?? []) {
      const nk = (l.normalized_key ?? "").trim();
      if (nk) {
        addressById.set(l.id, nk);
      } else {
        const line2 = [l.city, l.state].filter(Boolean).join(", ");
        addressById.set(l.id, [l.address_line1, line2, l.postal_code].filter(Boolean).join(", "));
      }
    }
  }

  return NextResponse.json({
    rows: rows.map((h: any) => ({
      id: h.id,
      name: (h.name?.trim() ?? "") || "(unnamed)",
      address: h.location_id ? (addressById.get(h.location_id) ?? "") : "",
    })),
    total: count ?? 0,
  });
}
