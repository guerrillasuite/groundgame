// app/crm/locations/page.tsx

import ListPage from "../_shared/ListPage";
import PeopleSearch from "../_shared/PeopleSearch";
import { getTenant } from "@/lib/tenant";
import { getServerSupabase } from "@/lib/supabase/server";


import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Read-only Supabase (prevents "Cookies can only be modified..." during render)
function getSupabaseReadOnly() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return store.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );
}

export default async function LocationsPage({
  searchParams,
}: { searchParams?: { q?: string } }) {
  const sb = getServerSupabase();
  const tenant = await getTenant();
  const q = (searchParams?.q ?? "").trim();

  // Prefer normalized_key; fetch parts for fallback
  let query = sb
    .from("locations")
    .select("id, normalized_key, address_line1, city, state, postal_code")
    .eq("tenant_id", tenant.id)
    .order("address_line1");

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      [
        `normalized_key.ilike.${like}`,
        `address_line1.ilike.${like}`,
        `city.ilike.${like}`,
        `state.ilike.${like}`,
        `postal_code.ilike.${like}`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const fmt = (l: any) => {
    const nk = (l.normalized_key ?? "").trim();
    if (nk) return nk;
    const line2 = [l.city, l.state].filter(Boolean).join(", ");
    return [l.address_line1, line2, l.postal_code].filter(Boolean).join(", ");
  };

  const rows =
    (data ?? []).map((l) => ({
      id: l.id,
      address: fmt(l),
    })) ?? [];

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Locations</h1>
        <PeopleSearch placeholder="Search locations…" />
      </div>

      <ListPage
        title=""
        columns={[{ key: "address", label: "Address", width: 520 }]}
        rows={rows}
      />
    </section>
  );
}
