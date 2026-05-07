"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const S = {
  bg:     "rgb(10 13 20)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
} as const;

const VIEWS = [
  { key: "list",     label: "List",     href: "/crm/sitrep" },
  { key: "kanban",   label: "Kanban",   href: "/crm/sitrep/kanban" },
  { key: "timeline", label: "Timeline", href: "/crm/sitrep/timeline" },
  { key: "calendar", label: "Calendar", href: "/crm/sitrep/calendar" },
] as const;

function NavBar() {
  const pathname = usePathname();

  const active =
    pathname.startsWith("/crm/sitrep/calendar") ? "calendar" :
    pathname.startsWith("/crm/sitrep/timeline") ? "timeline" :
    pathname.startsWith("/crm/sitrep/kanban")   ? "kanban"   :
    "list";

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 40,
      height: 48, flexShrink: 0,
      background: S.bg,
      borderBottom: `1px solid ${S.border}`,
      display: "flex", alignItems: "center",
      padding: "0 20px", gap: 16,
    }}>
      {/* Wordmark */}
      <span style={{ fontSize: 14, fontWeight: 800, color: S.text, letterSpacing: "0.04em", marginRight: 4 }}>
        SitRep
      </span>

      <div style={{ width: 1, height: 18, background: S.border }} />

      {/* Nav pills */}
      <div style={{
        display: "flex",
        background: "rgba(255,255,255,.06)",
        borderRadius: 10, padding: 3, gap: 2,
        border: `1px solid ${S.border}`,
      }}>
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            style={{
              padding: "4px 14px", borderRadius: 7,
              fontSize: 12, fontWeight: 600,
              textDecoration: "none",
              transition: "background .12s, color .12s",
              background: active === v.key ? "rgba(255,255,255,.12)" : "transparent",
              color: active === v.key ? S.text : S.dim,
            }}
          >
            {v.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SitRepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: S.bg }}>
      <Suspense fallback={
        <div style={{ height: 48, flexShrink: 0, background: S.bg, borderBottom: `1px solid ${S.border}` }} />
      }>
        <NavBar />
      </Suspense>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
