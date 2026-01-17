// (pwa)/storefront/orders/[id]/page.tsx
export const dynamic = "force-dynamic";
import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import OrderEditor from "./ui/OrderEditor";

function normalize(p: any) {
  const c = p?.contact ?? {};
  const d = p?.delivery ?? {};
  const title = (p?.title || "").trim();

  // Prefer given first/last; fallback to title; final fallback "Unknown Customer"
  const givenFirst = (c.first_name ?? "").trim();
  const givenLast  = (c.last_name  ?? "").trim();

  let first_name = givenFirst || "";
  let last_name  = givenLast  || "";

  if (!first_name && !last_name && title) {
    const parts = title.split(/\s+/);
    first_name = parts[0] ?? "";
    last_name  = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }

  const full_name = [first_name, last_name].filter(Boolean).join(" ") || "Unknown Customer";

  return {
    ...p,
    contact: {
      // keep granular fields for future use
      first_name: first_name || null,
      last_name:  last_name  || null,
      full_name,
      email: c.email ?? null,
      phone: c.phone ?? null,
    },
    delivery: {
      address_line1: d.address_line1 ?? null,
      unit:          d.unit ?? null,
      city:          d.city ?? null,
      state:         d.state ?? null,
      postal_code:   d.postal_code ?? null,
    },
  };
}


export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { data, error } = await sb.rpc("gg_get_order_v1", {
    p_tenant_id: tenantId,
    p_order_id: params.id,
  });

  if (error) {
    return <p style={{ color: "var(--red-10)", padding: 16 }}>Error: {error.message}</p>;
  }

  const raw = Array.isArray(data) ? data[0] : data;
  const payload = normalize(raw);

  return (
    <section className="stack" style={{ padding: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
      Order — {payload?.title || "Untitled"}
        </h1>
      <OrderEditor initial={payload} />
    </section>
  );
}
