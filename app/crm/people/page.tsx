// app/crm/people/page.tsx
import ListPage from "../_shared/ListPage";
import PeopleSearch from "../_shared/PeopleSearch";
import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import EditButton from "../_shared/EditButton";
import { updatePersonBound } from "./_actions";

// ⬇️ local, read-only Supabase client to avoid cookie writes in render
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseReadOnly() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return store.get(name)?.value; },
        set() {},          // no-ops prevent “Cookies can only be modified…” error
        remove() {},
      },
    }
  );
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const sb = getServerSupabase();
  const tenant = await getTenant();
  const q = (searchParams?.q ?? "").trim();

  let query = sb
    .from("people")
    .select("id,first_name,last_name,email,phone")
    .eq("tenant_id", tenant.id)
    .order("last_name");

  if (q) {
    const like = `%${q}%`;
    // Search first, last, email, phone
    query = query.or(
      [
        `first_name.ilike.${like}`,
        `last_name.ilike.${like}`,
        `email.ilike.${like}`,
        `phone.ilike.${like}`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows =
    (data ?? []).map((p) => ({
      id: p.id,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      email: p.email ?? "",
      phone: p.phone ?? "",
    })) ?? [];

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>People</h1>
        <PeopleSearch placeholder="Search people…" />
      </div>

      <ListPage
        title=""
        columns={[
          { key: "name", label: "Name", width: 240 },
          { key: "email", label: "Email", width: 240 },
          { key: "phone", label: "Phone", width: 160 },
        ]}
        rows={rows}
      />
    </section>
  );
}
