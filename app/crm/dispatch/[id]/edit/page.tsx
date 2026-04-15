import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect, notFound } from "next/navigation";
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

type Params = { params: Promise<{ id: string }> };

export default async function EditCampaignPage({ params }: Params) {
  const { id } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    redirect("/crm");
  }

  const sb = makeSb(tenant.id);
  const [{ data: campaign }, { data: domainRows }, { data: wlRows }] = await Promise.all([
    sb
      .from("email_campaigns")
      .select("id, name, subject, preview_text, from_name, from_email, reply_to, design_json, html_body, status, audience_type, audience_list_id, audience_segment_filters, audience_count")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .single(),
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

  if (!campaign) notFound();
  if (campaign.status !== "draft") redirect(`/crm/dispatch/${id}`);

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

  // Parse stored from_email into local + domain parts
  const [fromLocal = "", fromDomain = "groundgame.digital"] = (
    campaign.from_email ?? ""
  ).split("@");

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link
          href="/crm/dispatch"
          style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }}
        >
          ← Dispatch
        </Link>
      </div>
      <h1 style={{ margin: "0 0 24px" }}>Edit Campaign</h1>
      <ComposeFlow
        campaignId={campaign.id}
        initialDetails={{
          name: campaign.name,
          subject: campaign.subject,
          preview_text: campaign.preview_text ?? "",
          from_name: campaign.from_name,
          from_local: fromLocal,
          from_domain: fromDomain,
          reply_to: campaign.reply_to ?? "",
        }}
        initialAudience={{
          audience_type: campaign.audience_type as "segment" | "list",
          audience_list_id: campaign.audience_list_id ?? null,
          audience_segment_filters: campaign.audience_segment_filters ?? null,
        }}
        initialDesign={campaign.design_json}
        initialHtml={campaign.html_body}
        domains={domains}
        walklists={walklists}
      />
    </section>
  );
}
