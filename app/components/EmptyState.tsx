"use client";

import Link from "next/link";

interface EmptyStateProps {
  watermark?: string;
  icon?: string;
  headline: string;
  sub?: string;
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  link?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  size?: "full" | "compact";
}

export default function EmptyState({
  watermark,
  icon,
  headline,
  sub,
  cta,
  link,
  size = "full",
}: EmptyStateProps) {
  if (size === "compact") {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 0",
        color: "var(--gg-dim, rgb(134 150 168))",
      }}>
        {icon && <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>}
        <span style={{ fontSize: 13 }}>{headline}</span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 240,
      padding: "48px 24px",
      textAlign: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Watermark word */}
      {watermark && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            fontSize: 110,
            fontWeight: 900,
            letterSpacing: "0.15em",
            color: "rgba(255,255,255,0.03)",
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
            lineHeight: 1,
          }}
        >
          {watermark}
        </div>
      )}

      {/* Content — above watermark */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 360 }}>
        {icon && !watermark && (
          <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>{icon}</div>
        )}

        <p style={{
          margin: "0 0 8px",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--gg-text, rgb(238 242 246))",
          lineHeight: 1.4,
        }}>
          {headline}
        </p>

        {sub && (
          <p style={{
            margin: "0 0 20px",
            fontSize: 13,
            color: "var(--gg-dim, rgb(134 150 168))",
            lineHeight: 1.6,
          }}>
            {sub}
          </p>
        )}

        {cta && (
          cta.href ? (
            <Link href={cta.href} style={{
              display: "inline-block",
              padding: "9px 18px",
              background: "var(--gg-primary, #2563eb)",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}>
              {cta.label}
            </Link>
          ) : (
            <button
              onClick={cta.onClick}
              style={{
                padding: "9px 18px",
                background: "var(--gg-primary, #2563eb)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cta.label}
            </button>
          )
        )}

        {link && (
          link.href ? (
            <Link href={link.href} style={{
              fontSize: 13,
              color: "var(--gg-dim, rgb(134 150 168))",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}>
              {link.label}
            </Link>
          ) : (
            <button
              onClick={link.onClick}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 13,
                color: "var(--gg-dim, rgb(134 150 168))",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                cursor: "pointer",
              }}
            >
              {link.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}
