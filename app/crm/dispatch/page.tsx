import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import CampaignList, { type Campaign } from "@/app/components/crm/dispatch/CampaignList";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function DispatchPage() {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    redirect("/crm");
  }

  const sb = makeSb(tenant.id);
  const { data } = await sb
    .from("email_campaigns")
    .select("id, name, subject, status, audience_count, from_name, from_email, scheduled_at, sent_at, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const campaigns: Campaign[] = (data ?? []) as Campaign[];

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Dispatch</h1>
          <p className="text-dim" style={{ marginTop: 6 }}>
            Build and send bulk email campaigns to your contacts.
          </p>
        </div>
        <Link
          href="/crm/dispatch/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "var(--gg-primary, #2563eb)",
            color: "white",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          + New Campaign
        </Link>
      </div>

      <CampaignList campaigns={campaigns} />
    </section>
  );
}
