import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

type Params = { params: { id: string } };

export default async function PersonDetail({ params }: Params) {
  const sb = getServerSupabase();
  const tenant = await getTenant();
  const { data, error } = await sb
    .from("people")
    .select("id,first_name,last_name,email,phone")
    .eq("tenant_id", tenant.id)
    .eq("id", params.id)
    .single();

  if (error || !data) return <p style={{ padding: 16 }}>Person not found.</p>;

  return (
    <section style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>
        {(data.first_name ?? "") + " " + (data.last_name ?? "")}
      </h1>
      <p style={{ opacity: .8 }}>Email: {data.email ?? "—"}</p>
      <p style={{ opacity: .8 }}>Phone: {data.phone ?? "—"}</p>
    </section>
  );
}
