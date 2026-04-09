import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import ProductEditor from "./ui/ProductEditor";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function ProductProfilePage({ params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data: product } = await sb
    .from("products")
    .select("id, name, sku, description, retail_cents, on_hand, status, photo_url")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!product) notFound();

  const { count: activeOrderCount } = await sb
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  return (
    <ProductEditor
      product={product}
      activeOrderCount={activeOrderCount ?? 0}
    />
  );
}
