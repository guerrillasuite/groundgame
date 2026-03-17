"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

type NavItem  = { href: string; label: string };
type NavGroup = { label: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

const NAV: NavEntry[] = [
  { href: "/crm/opportunities",   label: "Opportunities" },
  { label: "Records", items: [
    { href: "/crm/people",        label: "People" },
    { href: "/crm/households",    label: "Households" },
    { href: "/crm/locations",     label: "Locations" },
    { href: "/crm/companies",     label: "Companies" },
  ]},
  { label: "Field", items: [
    { href: "/crm/lists",         label: "Lists" },
    { href: "/crm/survey",        label: "Surveys" },
    { href: "/crm/stops",         label: "Stops" },
  ]},
  { label: "Data", items: [
    { href: "/crm/import",        label: "Import" },
    { href: "/crm/dedupe",        label: "Dedupe" },
  ]},
  { href: "/crm/users",           label: "Users" },
  { href: "/crm/account",         label: "Account" },
];

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
          {NAV.map((entry) => {
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
