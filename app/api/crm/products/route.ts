import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/**
 * GET /api/crm/products
 * Returns active products for the current tenant.
 * Query params:
 *   ?ids=id1,id2,id3  — optional comma-separated product ID filter (curated subset)
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : null;

  let query = sb
    .from("products")
    .select("id, name, sku, on_hand")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
