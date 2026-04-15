import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DispatchSettingsPage() {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    redirect("/crm/settings");
  }

  return (
    <section className="stack">
      <div>
        <h1 style={{ margin: "0 0 4px" }}>Dispatch Settings</h1>
        <p className="text-dim" style={{ marginTop: 6 }}>
          Configure sending domains and defaults for bulk email campaigns.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <Link
          href="/crm/settings/dispatch/domains"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: "var(--gg-card, white)",
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>Sending Domains</p>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
              Add and verify custom sending domains for your campaigns.
            </p>
          </div>
          <span style={{ opacity: 0.4, fontSize: 18 }}>→</span>
        </Link>
      </div>
    </section>
  );
}
