import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type Params = { params: Promise<{ send_id: string }> };

export default async function UnsubscribePage({ params }: Params) {
  const { send_id } = await params;
  const sb = makeAdminSb();

  // Look up the send record
  const { data: send } = await sb
    .from("email_sends")
    .select("id, person_id, email_address, tenant_id, campaign_id")
    .eq("id", send_id)
    .single();

  if (!send) notFound();

  // Get tenant name for the confirmation message
  const { data: tenant } = await sb
    .from("tenants")
    .select("id, slug, branding")
    .eq("id", send.tenant_id)
    .single();

  const tenantName = (tenant?.branding as any)?.appName ?? tenant?.slug ?? "this organization";

  // Insert unsubscribe record (upsert — idempotent)
  await sb.from("email_unsubscribes").upsert(
    {
      tenant_id: send.tenant_id,
      person_id: send.person_id,
      email_address: send.email_address,
      campaign_id: send.campaign_id,
    },
    { onConflict: "tenant_id,email_address", ignoreDuplicates: true }
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: "40px 48px",
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px", color: "#111" }}>
          Unsubscribed
        </h1>
        <p style={{ fontSize: 15, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
          <strong>{send.email_address}</strong> has been unsubscribed from{" "}
          <strong>{tenantName}</strong> emails. You will no longer receive emails from this
          organization.
        </p>
      </div>
    </div>
  );
}
