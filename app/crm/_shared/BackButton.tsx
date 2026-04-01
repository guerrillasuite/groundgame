"use client";

import { useRouter } from "next/navigation";

type Props = {
  href: string;
  label: string;
  style?: React.CSSProperties;
};

/**
 * Navigates back in browser history if available (preserving search/filter state in the URL),
 * otherwise falls back to the provided href.
 */
export default function BackButton({ href, label, style }: Props) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof window !== "undefined" && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
    // else: let the anchor's natural href navigation happen
  }

  return (
    <a href={href} onClick={handleClick} style={style}>
      {label}
    </a>
  );
}
