// app/crm/page.tsx
import Link from "next/link";
import { Wallet, Users, MapPinHouse, Building2, Map, ListChecks, ClipboardList, ShieldCheck, Upload } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { hasFeature, type FeatureKey } from "@/lib/features";

const TILES: { href: string; label: string; desc: string; icon: React.ElementType; featureKey: FeatureKey | null }[] = [
  { href: "/crm/opportunities", label: "Opportunities", desc: "Quotes, orders, and pipeline",      icon: Wallet,        featureKey: "crm_opportunities" },
  { href: "/crm/people",        label: "People",        desc: "Contacts & leads",                  icon: Users,         featureKey: "crm" },
  { href: "/crm/households",    label: "Households",    desc: "Linked people & addresses",         icon: MapPinHouse,   featureKey: "crm" },
  { href: "/crm/locations",     label: "Locations",     desc: "Delivery/service addresses",        icon: Building2,     featureKey: "crm" },
  { href: "/crm/stops",         label: "Stops",         desc: "Activity & visit history",          icon: Map,           featureKey: "crm_stops" },
  { href: "/crm/lists",         label: "Lists",         desc: "Dial & walklists",                  icon: ListChecks,    featureKey: "crm_lists" },
  { href: "/crm/survey",        label: "Surveys",       desc: "Polls & questionnaires",            icon: ClipboardList, featureKey: "crm_surveys" },
  { href: "/crm/users",         label: "Users",         desc: "Manage accounts & tenants",         icon: ShieldCheck,   featureKey: null },
  { href: "/crm/import",        label: "Import",        desc: "Bulk upload people & locations",    icon: Upload,        featureKey: "crm_import" },
];

export default async function CrmHome() {
  const { features } = await getTenant();
  const visible = TILES.filter((t) => t.featureKey === null || hasFeature(features, t.featureKey));

  return (
    <section className="stack">
      <div>
        <h2 style={{ margin: 0 }}>Welcome</h2>
        <p className="text-dim" style={{ marginTop: 6 }}>Choose a workspace to get started.</p>
      </div>

      <div className="stack">
        {visible.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="press-card">
            <div className="press-card__icon"><Icon size={24} /></div>
            <div>
              <div className="press-card__title">{label}</div>
              <div className="press-card__subtitle">{desc}</div>
            </div>
            <svg className="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}
