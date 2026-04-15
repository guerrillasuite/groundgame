import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import SendingDomainManager from "@/app/components/crm/dispatch/SendingDomainManager";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function SendingDomainsPage() {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    redirect("/crm/settings");
  }

  const sb = makeSb(tenant.id);
  const { data } = await sb
    .from("email_sending_domains")
    .select("id, domain, verified, verified_at, dns_records, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at");

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link
          href="/crm/settings/dispatch"
          style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }}
        >
          ← Dispatch Settings
        </Link>
      </div>
      <div>
        <h1 style={{ margin: "0 0 4px" }}>Sending Domains</h1>
        <p className="text-dim" style={{ marginTop: 6 }}>
          Verify custom domains so your campaigns arrive from your own brand.
        </p>
      </div>
      <SendingDomainManager initialDomains={data ?? []} />
    </section>
  );
}
