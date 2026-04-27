"use client";

import { useMemo, useEffect } from "react";
import Link from "next/link";

const HEADLINES = [
  "We broke something. Our bad.",
  "Command has gone dark. We're working on reestablishing contact.",
  "Our servers are having an existential crisis.",
  "Something blew up on our end. Definitely not yours.",
];

export default function GlobalError({
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
        @keyframes gs-glitch-entrance-500 {
          0%   { clip-path: inset(0 0 100% 0); transform: translateX(0); filter: brightness(1); }
          3%   { clip-path: inset(20% 0 60% 0); transform: translateX(-4px); filter: brightness(2.5); }
          5%   { text-shadow: -8px 0 #ff4400, 8px 0 #ffcc00; }
          6%   { clip-path: inset(0 0 0 0); transform: translateX(3px); filter: brightness(1); }
          9%   { clip-path: inset(55% 0 30% 0); transform: translateX(-2px); }
          11%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          13%  { clip-path: inset(70% 0 5% 0); transform: translateX(4px); filter: brightness(1.8); }
          15%  { clip-path: inset(0 0 0 0); transform: translateX(-1px); }
          20%  { clip-path: inset(40% 0 40% 0); transform: translateX(2px); }
          24%  { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); }
          34%  { clip-path: inset(80% 0 10% 0); transform: translateX(-1px); }
          37%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          45%  { clip-path: inset(15% 0 75% 0); transform: translateX(1px); }
          48%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          58%  { clip-path: inset(65% 0 20% 0); transform: translateX(-1px); text-shadow: -4px 0 rgba(255,68,0,.5), 4px 0 rgba(255,204,0,.5); }
          60%  { clip-path: inset(0 0 0 0); transform: translateX(0); text-shadow: none; }
          72%  { clip-path: inset(30% 0 55% 0); transform: translateX(1px); }
          74%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          100% { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); text-shadow: none; }
        }
        @keyframes gs-glitch-idle-500 {
          0%, 88%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          89%      { clip-path: inset(60% 0 30% 0); transform: translateX(-1px); text-shadow: -2px 0 rgba(255,68,0,.4), 2px 0 rgba(255,204,0,.4); }
          90%      { clip-path: inset(0 0 0 0); transform: translateX(1px); }
          91%      { clip-path: inset(85% 0 5% 0); transform: translateX(0); }
          92%      { clip-path: inset(0 0 0 0); text-shadow: none; }
          100%     { clip-path: inset(0 0 0 0); transform: translateX(0); }
        }
        .gs-glitch-entrance-500 { animation: gs-glitch-entrance-500 5s ease-out forwards; }
        .gs-glitch-idle-500     { animation: gs-glitch-idle-500 4s linear infinite; animation-delay: 5s; }
      `}</style>

      <div style={{
        minHeight: "100dvh",
        background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(239,68,68,0.07), rgb(10 13 20) 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
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
            className="gs-glitch-entrance-500"
            style={{
              fontSize: "clamp(280px, 42vw, 520px)",
              fontWeight: 900,
              color: "rgba(255,255,255,0.09)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              display: "block",
            }}
          >
            <span className="gs-glitch-idle-500">500</span>
          </span>
        </div>

        {/* Card */}
        <div style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          background: "rgba(16,20,30,0.52)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: "40px 36px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55), inset 3px 0 0 0 #ef4444",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--gg-dim, rgb(134 150 168))",
            marginBottom: 14,
          }}>
            Error 500
          </div>

          <h1 style={{
            margin: "0 0 10px",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--gg-text, rgb(238 242 246))",
            lineHeight: 1.3,
          }}>
            {headline}
          </h1>

          <p style={{
            margin: "0 0 28px",
            fontSize: 14,
            color: "var(--gg-dim, rgb(134 150 168))",
            lineHeight: 1.6,
          }}>
            Our team has been notified. Try again in a moment.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
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

            <Link href="/" style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 20px",
              background: "transparent",
              color: "var(--gg-dim, rgb(134 150 168))",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}>
              ← Back to base
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
