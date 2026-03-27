import Link from "next/link";
import { Icon } from "../components/Icon";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";

export default async function PwaHome() {
  const { features } = await getTenant();

  return (
    <section style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>GroundGame</h1>

      <div className="gg-appgrid">
        {hasFeature(features, "pwa_dials") && (
          <Link href="/dials" className="gg-app">
            <span className="gg-app-ico">
              <Icon name="phone" size={40} aria-hidden />
            </span>
            <h3>Dials</h3>
          </Link>
        )}

        {hasFeature(features, "pwa_doors") && (
          <Link href="/doors" className="gg-app">
            <span className="gg-app-ico">
              <Icon name="door" size={40} aria-hidden />
            </span>
            <h3>Doors</h3>
          </Link>
        )}

        {hasFeature(features, "pwa_storefront") && (
          <Link href="/storefront" className="gg-app">
            <span className="gg-app-ico">
              <Icon name="store" size={40} aria-hidden />
            </span>
            <h3>Storefront View</h3>
          </Link>
        )}
      </div>

      {hasFeature(features, "crm") && (
        <div className="crm-fab">
          <Link href="/crm" className="crm-fab-btn">
            <Icon name="kanban" size={18} aria-hidden />
            <span>CRM</span>
          </Link>
        </div>
      )}
    </section>
  );
}
