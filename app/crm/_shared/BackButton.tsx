"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  href: string;
  label: string;
  style?: React.CSSProperties;
};

const FROM_LABELS: Record<string, string> = {
  search:     "← Back to search",
  list:       "← Back to list",
  people:     "← People",
  households: "← Households",
  locations:  "← Locations",
  companies:  "← Companies",
};

export default function BackButton({ href, label, style }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hovered, setHovered] = useState(false);

  const from = searchParams.get("from");
  const displayLabel = (from && FROM_LABELS[from]) ?? label;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof window !== "undefined" && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 14px",
        fontSize: 14,
        fontWeight: 500,
        borderRadius: 6,
        border: "1px solid var(--gg-border, #d1d5db)",
        background: hovered ? "var(--gg-bg, #f3f4f6)" : "transparent",
        color: "var(--gg-text-dim, #374151)",
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 0.12s",
        ...style,
      }}
    >
      {displayLabel}
    </a>
  );
}
