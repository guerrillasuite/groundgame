"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { key: "list",     label: "List",     href: "/crm/sitrep" },
  { key: "kanban",   label: "Kanban",   href: "/crm/sitrep/kanban" },
  { key: "calendar", label: "Calendar", href: "/crm/sitrep/calendar" },
] as const;

export function SitRepViewToggle() {
  const pathname = usePathname();

  const active = VIEWS.find((v) => {
    if (v.key === "list") return pathname === "/crm/sitrep";
    return pathname.startsWith(v.href);
  })?.key ?? "list";

  return (
    <div style={{
      display: "flex",
      background: "rgba(255,255,255,.06)",
      borderRadius: 10,
      padding: 3,
      gap: 2,
      border: "1px solid rgba(255,255,255,.08)",
    }}>
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          style={{
            padding: "5px 14px",
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            transition: "background .12s, color .12s",
            background: active === v.key ? "rgba(255,255,255,.12)" : "transparent",
            color: active === v.key ? "rgb(238 242 246)" : "rgb(160 174 192)",
          }}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
