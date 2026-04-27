"use client";

import { useMemo, useEffect } from "react";
import Link from "next/link";

const HEADLINES = [
  "We broke something. Our bad.",
  "This sector just went dark on us.",
  "Something's malfunctioning in the field. On us.",
  "Command is experiencing technical difficulties. The irony is not lost on us.",
];

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headline = useMemo(
    () => HEADLINES[Math.floor(Math.random() * HEADLINES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <style>{`
        @keyframes gs-glitch-entrance-crm5 {
          0%   { clip-path: inset(0 0 100% 0); transform: translateX(0); filter: brightness(1); }
          5%   { clip-path: inset(20% 0 60% 0); transform: translateX(-4px); filter: brightness(2.5); }
          8%   { text-shadow: -6px 0 #ff4400, 6px 0 #ffcc00; }
          10%  { clip-path: inset(0 0 0 0); transform: translateX(3px); filter: brightness(1); }
          14%  { clip-path: inset(55% 0 30% 0); transform: translateX(-2px); }
          18%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          22%  { clip-path: inset(70% 0 5% 0); transform: translateX(4px); filter: brightness(1.8); }
          26%  { clip-path: inset(0 0 0 0); transform: translateX(-1px); }
          35%  { clip-path: inset(40% 0 40% 0); transform: translateX(2px); }
          40%  { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); }
          55%  { clip-path: inset(80% 0 10% 0); transform: translateX(-1px); }
          60%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          75%  { clip-path: inset(15% 0 75% 0); transform: translateX(1px); }
          80%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          100% { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); }
        }
        @keyframes gs-glitch-idle-crm5 {
          0%, 92%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          93%      { clip-path: inset(60% 0 30% 0); transform: translateX(-1px); text-shadow: -2px 0 rgba(255,68,0,.4), 2px 0 rgba(255,204,0,.4); }
          94%      { clip-path: inset(0 0 0 0); transform: translateX(1px); }
          95%      { clip-path: inset(85% 0 5% 0); transform: translateX(0); }
          96%      { clip-path: inset(0 0 0 0); }
          100%     { clip-path: inset(0 0 0 0); transform: translateX(0); }
        }
        .gs-glitch-entrance-crm5 { animation: gs-glitch-entrance-crm5 2.2s ease-out forwards; }
        .gs-glitch-idle-crm5     { animation: gs-glitch-idle-crm5 5s linear infinite; animation-delay: 2.2s; }
      `}</style>

      <div style={{
        minHeight: "70vh",
        background: "radial-gradient(ellipse 60% 60% at 50% 40%, rgba(239,68,68,0.05), transparent 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Big glitched number — behind card */}
        <div style={{
          position: "absolute",
          userSelect: "none",
          pointerEvents: "none",
          zIndex: 0,
        }}>
          <span
            className="gs-glitch-entrance-crm5"
            style={{
              fontSize: "clamp(100px, 18vw, 160px)",
              fontWeight: 900,
              color: "rgba(255,255,255,0.03)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              display: "block",
            }}
          >
            <span className="gs-glitch-idle-crm5">500</span>
          </span>
        </div>

        {/* Card */}
        <div style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 440,
          background: "rgba(28,36,48,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          padding: "36px 32px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.45), inset 3px 0 0 0 #ef4444",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--gg-dim, rgb(134 150 168))",
            marginBottom: 12,
          }}>
            Error 500
          </div>

          <h1 style={{
            margin: "0 0 10px",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--gg-text, rgb(238 242 246))",
            lineHeight: 1.3,
          }}>
            {headline}
          </h1>

          <p style={{
            margin: "0 0 24px",
            fontSize: 14,
            color: "var(--gg-dim, rgb(134 150 168))",
            lineHeight: 1.6,
          }}>
            Try again or navigate away — we&apos;ve logged the issue.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={reset}
              style={{
                padding: "9px 18px",
                background: "var(--gg-primary, #2563eb)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>

            <Link href="/crm" style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              background: "transparent",
              color: "var(--gg-dim, rgb(134 150 168))",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}>
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
