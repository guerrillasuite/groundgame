"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { type FeatureKey, hasFeature } from "@/lib/features";

type NavItem  = { href: string; label: string; feature?: FeatureKey; superAdminOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };
type NavEntry = (NavItem & { superAdminOnly?: boolean }) | NavGroup;

function buildNav(features: readonly FeatureKey[], isSuperAdmin: boolean): NavEntry[] {
  const f = (key: FeatureKey) => hasFeature(features, key);

  const nav: NavEntry[] = [];

  if (f("crm_opportunities")) {
    nav.push({ href: "/crm/opportunities", label: "Opportunities" });
  }

  // Records: always show if crm is on; filter Companies by crm_companies
  if (f("crm")) {
    const recordItems: NavItem[] = [
      { href: "/crm/people",      label: "People" },
      { href: "/crm/households",  label: "Households" },
      { href: "/crm/locations",   label: "Locations" },
    ];
    if (f("crm_companies")) recordItems.push({ href: "/crm/companies", label: "Companies" });
    recordItems.push({ href: "/crm/products", label: "Products" });
    nav.push({ label: "Records", items: recordItems });
  }

  // Field: show dropdown if any child is enabled
  const fieldItems: NavItem[] = [];
  if (f("crm_lists"))   fieldItems.push({ href: "/crm/lists",   label: "Lists" });
  if (f("crm_surveys")) fieldItems.push({ href: "/crm/survey",  label: "Surveys" });
  if (f("crm_stops"))   fieldItems.push({ href: "/crm/stops",   label: "Stops" });
  if (fieldItems.length > 0) nav.push({ label: "Field", items: fieldItems });

  // Reminders: flat link
  if (f("crm")) {
    nav.push({ href: "/crm/reminders", label: "Reminders" });
  }

  // Data: show dropdown if any child is enabled
  const dataItems: NavItem[] = [];
  if (f("crm_import"))  dataItems.push({ href: "/crm/import",     label: "Import" });
  if (f("crm_dedupe"))  dataItems.push({ href: "/crm/dedupe",     label: "Dedupe" });
  if (f("crm_cleanup")) dataItems.push({ href: "/crm/cleanup",    label: "Cleanup" });
  if (f("crm"))         dataItems.push({ href: "/crm/bulk-edit",  label: "Bulk Edit" });
  if (dataItems.length > 0) nav.push({ label: "Data", items: dataItems });

  // Settings: always show; Pipeline Stages only with crm_opportunities; Tenants for superadmin only
  const settingsItems: NavItem[] = [
    { href: "/crm/settings", label: "Brand Settings" },
    { href: "/crm/settings/users", label: "Users" },
  ];
  if (f("crm")) {
    settingsItems.push({ href: "/crm/settings/contact-types", label: "Pipelines" });
  }
  if (f("crm")) {
    settingsItems.push({ href: "/crm/settings/dispositions", label: "Dispositions" });
  }
  if (isSuperAdmin) {
    settingsItems.push({ href: "/crm/admin/tenants", label: "Tenants" });
  }
  nav.push({ label: "Settings", items: settingsItems });

  nav.push({ href: "/crm/account", label: "Account" });

  return nav;
}

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

function NavGroupItem({ group, pathname }: { group: NavGroup; pathname: string | null }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isActive = group.items.some(
    (item) => pathname === item.href || pathname?.startsWith(item.href + "/")
  );

  const open = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    setVisible(true);
  }, []);

  const scheduleClose = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const dropdown = visible ? createPortal(
    <div
      className="crm-nav-dropdown"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      {group.items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`crm-nav-link${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => setVisible(false)}
          >
            {item.label}
          </Link>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div
      style={{ display: "inline-flex" }}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={btnRef}
        className={`crm-nav-link${isActive ? " is-active" : ""}`}
        style={{ background: "none", border: "1px solid transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        aria-haspopup="true"
        aria-expanded={visible}
      >
        {group.label}
        <span style={{ fontSize: "0.65em", opacity: 0.7 }}>▾</span>
      </button>
      {dropdown}
    </div>
  );
}

interface CrmHeaderProps {
  features: readonly FeatureKey[];
  isSuperAdmin: boolean;
}

export default function CrmHeader({ features, isSuperAdmin }: CrmHeaderProps) {
  const pathname = usePathname();
  const nav = buildNav(features, isSuperAdmin);

  return (
    <header className="crm-header topbar-dark sticky top-0 z-40">
      <div className="crm-header-inner">
        <Link href="/crm" className="crm-logo row" aria-label="GroundGame CRM Home">
          <div className="crm-logo-badge">GG</div>
          <h1>GroundGame CRM</h1>
        </Link>

        <nav className="crm-nav" role="navigation" aria-label="CRM">
          {nav.map((entry) => {
            if (isGroup(entry)) {
              return <NavGroupItem key={entry.label} group={entry} pathname={pathname} />;
            }
            const active = pathname === entry.href && entry.href !== "/crm"
              ? true
              : pathname?.startsWith(entry.href) && entry.href !== "/crm";
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`crm-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {entry.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
