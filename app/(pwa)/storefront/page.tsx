import Link from "next/link";
import { Icon } from "../../components/Icon";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function StorefrontHome() {
  const tenant = await getTenant();
  const f = tenant.features;

  const tiles = [
    { href: "/storefront/take-order",  icon: "cart",  label: "Take Order",      feature: "pwa_storefront_take_order"  },
    { href: "/storefront/make-sale",   icon: "cart",  label: "Make Sale",       feature: "pwa_storefront_make_sale"   },
    { href: "/storefront/orders",      icon: "list",  label: "View Orders",     feature: "pwa_storefront_orders"      },
    { href: "/storefront/inventory",   icon: "boxes", label: "View Inventory",  feature: "pwa_storefront_inventory"   },
    { href: "/storefront/take-survey", icon: "flag",  label: "Take Survey",     feature: "pwa_storefront_survey"      },
  ] as const;

  const visible = tiles.filter((t) => hasFeature(f, t.feature));

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Storefront</h1>
      {visible.length === 0 ? (
        <p style={{ opacity: 0.6, fontSize: 14 }}>
          No storefront features are enabled for your account. Contact your administrator.
        </p>
      ) : (
        <div className="gg-appgrid">
          {visible.map((t) => (
            <Link key={t.href} href={t.href} className="gg-app">
              <span className="gg-app-ico">
                <Icon name={t.icon} size={40} aria-hidden />
              </span>
              <h3>{t.label}</h3>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
