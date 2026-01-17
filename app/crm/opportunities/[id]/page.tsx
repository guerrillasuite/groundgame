import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

type Params = { params: { id: string } };

export default async function OpportunityDetail({ params }: Params) {
  const sb = getServerSupabase();
  const tenant = await getTenant();
  const { data, error } = await sb
    .from("opportunities")
    .select("id,title,stage,amount_cents,updated_at,description")
    .eq("tenant_id", tenant.id)
    .eq("id", params.id)
    .single();

  if (error || !data) return <p style={{ padding: 16 }}>Opportunity not found.</p>;

  return (
    <section style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>{data.title ?? "(Untitled)"}</h1>
      <p style={{ opacity: .8, marginTop: 4 }}>Stage: {data.stage ?? "new"}</p>
      <p style={{ opacity: .8 }}>Amount: ${(data.amount_cents ?? 0) / 100}</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{data.description ?? ""}</pre>
    </section>
  );
}
