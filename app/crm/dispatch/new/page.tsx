import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import ComposeFlow, { type DispatchDomain } from "@/app/components/crm/dispatch/ComposeFlow";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function NewCampaignPage() {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    redirect("/crm");
  }

  const sb = makeSb(tenant.id);
  const [{ data: domainRows }, { data: wlRows }] = await Promise.all([
    sb
      .from("email_sending_domains")
      .select("domain, verified")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
    sb
      .from("walklists")
      .select("id, name, mode, walklist_items(count)")
      .eq("tenant_id", tenant.id)
      .order("name"),
  ]);

  // Always include the GS-managed default
  const domains: DispatchDomain[] = [
    { domain: "groundgame.digital", verified: true },
    ...((domainRows ?? []) as DispatchDomain[]),
  ];

  const walklists = (wlRows ?? []).map((w: any) => ({
    id: w.id,
    name: w.name,
    mode: w.mode,
    total_targets: w.walklist_items?.[0]?.count ?? 0,
  }));

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link
          href="/crm/dispatch"
          style={{
            fontSize: 13,
            color: "var(--gg-text-dim, #6b7280)",
            textDecoration: "none",
          }}
        >
          ← Dispatch
        </Link>
      </div>
      <h1 style={{ margin: "0 0 24px" }}>New Campaign</h1>
      <ComposeFlow domains={domains} walklists={walklists} />
    </section>
  );
}
