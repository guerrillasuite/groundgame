import Link from "next/link";
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

function formatCents(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function InactiveProductsPage() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("products")
    .select("id, name, sku, on_hand, retail_cents")
    .eq("tenant_id", tenant.id)
    .eq("status", "inactive")
    .order("name", { ascending: true });

  return (
    <section className="stack" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link href="/storefront/inventory" style={{ fontSize: 13, opacity: 0.6, textDecoration: "none" }}>
          ← Inventory
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inactive Products</h1>
      </div>
      <p className="text-dim" style={{ marginTop: 4 }}>
        These products are not shown in order forms. Click a product to edit or reactivate it.
      </p>

      {error && <p style={{ color: "var(--red-10)" }}>Error: {error.message}</p>}

      {!error && (!data || data.length === 0) && (
        <p style={{ opacity: 0.5, fontSize: 14 }}>No inactive products.</p>
      )}

      {!error && data && data.length > 0 && (
        <div className="table" role="table" style={{ width: "100%" }}>
          <div className="row head" role="row" style={{ fontWeight: 700 }}>
            <div style={{ flex: 2 }}>Product</div>
            <div style={{ flex: 1 }}>SKU</div>
            <div style={{ width: 90, textAlign: "right" }}>Price</div>
            <div style={{ width: 90, textAlign: "right" }}>On Hand</div>
          </div>
          {data.map((p) => (
            <Link
              key={p.id}
              href={`/storefront/inventory/${p.id}`}
              className="row"
              style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
            >
              <div style={{ flex: 2, fontWeight: 600, color: "var(--gg-primary, #2563eb)" }}>{p.name}</div>
              <div style={{ flex: 1, fontSize: 13, opacity: 0.65 }}>{p.sku ?? "—"}</div>
              <div style={{ width: 90, textAlign: "right", fontSize: 13 }}>{formatCents(p.retail_cents)}</div>
              <div style={{ width: 90, textAlign: "right", fontSize: 13 }}>{p.on_hand ?? 0}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
