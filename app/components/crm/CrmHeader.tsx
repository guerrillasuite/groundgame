"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/crm", label: "Home" },
  { href: "/crm/opportunities", label: "Opportunities" },
  { href: "/crm/people", label: "People" },
  { href: "/crm/households", label: "Households" },
  { href: "/crm/locations", label: "Locations" },
  { href: "/crm/stops", label: "Stops" },
  { href: "/crm/lists", label: "Lists" },
  { href: "/crm/account", label: "Account" },
];

export default function CrmHeader() {
  const pathname = usePathname();

  return (
    <header className="crm-header topbar-dark sticky top-0 z-40">
      <div className="crm-header-inner">
        <Link href="/crm" className="crm-logo row" aria-label="GroundGame CRM Home">
          <div className="crm-logo-badge">GG</div>
          <h1>GroundGame CRM</h1>
        </Link>

        <nav className="crm-nav" role="navigation" aria-label="CRM">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || (href !== "/crm" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`crm-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
