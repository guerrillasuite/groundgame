import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import CampaignResults, {
  type CampaignDetail,
  type CampaignStats,
  type SendRow,
} from "@/app/components/crm/dispatch/CampaignResults";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: Promise<{ id: string }> };

export default async function CampaignDetailPage({ params }: Params) {
  const { id } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    redirect("/crm");
  }

  const sb = makeSb(tenant.id);

  const { data: campaign, error } = await sb
    .from("email_campaigns")
    .select("id, name, subject, from_name, from_email, status, audience_count, sent_at, scheduled_at, created_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !campaign) notFound();

  // Drafts redirect to edit
  if (campaign.status === "draft") redirect(`/crm/dispatch/${id}/edit`);

  // Fetch sends with click + unsubscribe flags
  const { data: sendRows } = await sb
    .from("email_sends")
    .select("id, person_id, email_address, status, bounce_type, bounce_reason, sent_at")
    .eq("campaign_id", id)
    .order("created_at")
    .limit(2000);

  const sends = sendRows ?? [];
  const personIds = [...new Set(sends.map((s: any) => s.person_id).filter(Boolean))];

  // Fetch person names
  let personMap = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: ppl } = await sb
      .from("people")
      .select("id, first_name, last_name, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .in("id", personIds.slice(0, 500));
    for (const p of ppl ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      personMap.set(p.id, name);
    }
  }

  // Fetch click + unsubscribe flags
  const [{ data: clicks }, { data: unsubs }] = await Promise.all([
    sb
      .from("email_clicks")
      .select("send_id")
      .eq("campaign_id", id),
    sb
      .from("email_unsubscribes")
      .select("campaign_id, email_address")
      .eq("campaign_id", id)
      .eq("tenant_id", tenant.id),
  ]);

  const clickedSendIds = new Set((clicks ?? []).map((c: any) => c.send_id));
  const unsubEmails = new Set((unsubs ?? []).map((u: any) => u.email_address));

  const typedSends: SendRow[] = sends.map((s: any) => ({
    id: s.id,
    person_id: s.person_id,
    person_name: personMap.get(s.person_id) ?? "",
    email_address: s.email_address,
    status: s.status,
    bounce_type: s.bounce_type,
    bounce_reason: s.bounce_reason,
    clicked: clickedSendIds.has(s.id),
    unsubscribed: unsubEmails.has(s.email_address),
    sent_at: s.sent_at,
  }));

  const stats: CampaignStats = {
    total_sent: typedSends.filter((s) => s.status === "sent").length,
    total_bounced: typedSends.filter((s) => s.status === "bounced").length,
    hard_bounced: typedSends.filter((s) => s.status === "bounced" && s.bounce_type === "hard").length,
    soft_bounced: typedSends.filter((s) => s.status === "bounced" && s.bounce_type === "soft").length,
    total_clicks: clicks?.length ?? 0,
    total_unsubscribes: unsubs?.length ?? 0,
  };

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
      <h1 style={{ margin: "0 0 4px" }}>{campaign.name}</h1>

      <CampaignResults
        campaign={campaign as CampaignDetail}
        stats={stats}
        sends={typedSends}
      />
    </section>
  );
}
