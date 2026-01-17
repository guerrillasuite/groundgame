// app/crm/page.tsx
import Link from "next/link";
import { Wallet, Users, MapPinHouse, Building2, Map, ListChecks, ClipboardList } from "lucide-react";

const TILES = [
  { href: "/crm/opportunities", label: "Opportunities", desc: "Quotes, orders, and pipeline", icon: Wallet },
  { href: "/crm/people",        label: "People",        desc: "Contacts & leads",           icon: Users },
  { href: "/crm/households",    label: "Households",    desc: "Linked people & addresses",  icon: MapPinHouse },
  { href: "/crm/locations",     label: "Locations",     desc: "Delivery/service addresses", icon: Building2 },
  { href: "/crm/stops",         label: "Stops",         desc: "Activity & visit history",   icon: Map },
  { href: "/crm/lists",         label: "Lists",         desc: "Dial & walklists",           icon: ListChecks },
  { href: "/crm/survey",        label: "Surveys",       desc: "Polls & questionnaires",     icon: ClipboardList },
];

export default function CrmHome() {
  return (
    <section className="stack">
      <div>
        <h2 style={{ margin: 0 }}>Welcome</h2>
        <p className="text-dim" style={{ marginTop: 6 }}>Choose a workspace to get started.</p>
      </div>

      {/* Uses your app grid + app tiles */}
      <div className="stack">
        {TILES.map(({ href, label, desc, icon: Icon }) => (
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