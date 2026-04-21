import { getTenant } from "@/lib/tenant";
import { requireDirectorPage } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import SuppressionListPanel from "./SuppressionListPanel";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function SuppressionListPage() {
  const user = await requireDirectorPage();
  const tenant = await getTenant();

  if (!hasFeature(tenant.features, "crm_dispatch") && !user.isSuperAdmin) {
    redirect("/crm/settings");
  }

  const sb = makeSb(tenant.id);

  const { data: rows } = await sb
    .from("email_unsubscribes")
    .select("id, email_address, person_id, unsubscribed_at, campaign_id")
    .eq("tenant_id", tenant.id)
    .order("unsubscribed_at", { ascending: false })
    .limit(500);

  return (
    <section className="stack">
      <div>
        <h1 style={{ margin: "0 0 4px" }}>Suppression List</h1>
        <p className="text-dim" style={{ marginTop: 6 }}>
          These addresses are blocked from receiving campaign emails. Entries are added automatically
          when someone unsubscribes or when an email hard-bounces.
        </p>
      </div>
      <SuppressionListPanel rows={rows ?? []} tenantId={tenant.id} />
    </section>
  );
}
