"use client";

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

/**
 * Navigates back in browser history if available (preserving search/filter state in the URL),
 * otherwise falls back to the provided href.
 * Reads ?from= query param to auto-label the button based on navigation context.
 */
export default function BackButton({ href, label, style }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const displayLabel = (from && FROM_LABELS[from]) ?? label;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof window !== "undefined" && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
    // else: let the anchor's natural href navigation happen
  }

  return (
    <a href={href} onClick={handleClick} style={style}>
      {displayLabel}
    </a>
  );
}
