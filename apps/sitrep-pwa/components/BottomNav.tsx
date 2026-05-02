"use client";

import { usePathname, useRouter } from "next/navigation";

const S = {
  bg:     "rgb(10 13 20)",
  border: "rgba(255,255,255,.07)",
  dim:    "rgb(100 116 139)",
} as const;

const tabs = [
  {
    href: "/list",
    label: "List",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--gg-primary,#2563eb)" : S.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--gg-primary,#2563eb)" : S.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      height: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))",
      paddingBottom: "env(safe-area-inset-bottom)",
      background: S.bg,
      borderTop: `1px solid ${S.border}`,
      display: "flex",
      alignItems: "center",
      zIndex: 100,
    }}>
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            style={{
              flex: 1,
              height: "var(--bottom-nav-h)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {tab.icon(active)}
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: active ? "var(--gg-primary,#2563eb)" : S.dim,
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
