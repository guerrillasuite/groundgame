"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const S = {
  card:   "rgb(20 25 38)",
  border: "rgba(255,255,255,.07)",
  dim:    "rgb(100 116 139)",
  text:   "rgb(236 240 245)",
} as const;

export function CollapsibleCard({
  title,
  accentColor,
  viewAllHref,
  storageKey,
  children,
  padding = "0 22px 20px",
}: {
  title: string;
  accentColor: string;
  viewAllHref?: string;
  storageKey: string;
  children: React.ReactNode;
  padding?: string;
}) {
  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(`cc:${storageKey}`);
    if (stored !== null) setOpen(stored === "1");
    setHydrated(true);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(`cc:${storageKey}`, next ? "1" : "0");
  }

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${S.border}`,
      borderRadius: 12,
      boxShadow: `inset 3px 0 0 0 ${accentColor}`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 20px",
        borderBottom: open ? `1px solid ${S.border}` : "none",
        cursor: "pointer",
        userSelect: "none",
      }} onClick={toggle}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.07em", color: S.dim, flex: 1,
        }}>
          {title}
        </span>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", flexShrink: 0 }}
          >
            View all →
          </Link>
        )}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{
            flexShrink: 0,
            transition: "transform .2s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            opacity: hydrated ? 1 : 0,
          }}
        >
          <path d="M2.5 4.5L7 9.5L11.5 4.5" stroke={S.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Content */}
      <div style={{
        padding: open ? padding : 0,
        maxHeight: open ? "9999px" : 0,
        overflow: "hidden",
        transition: "max-height .25s ease, padding .25s ease",
      }}>
        {children}
      </div>
    </div>
  );
}
