"use client";

import { useMemo } from "react";
import Link from "next/link";

const HEADLINES = [
  "Intel suggests this location doesn't exist.",
  "We sent you to a dead grid.",
  "Target not found. This route has gone dark.",
  "Nothing at these coordinates.",
];

export default function NotFound() {
  const headline = useMemo(
    () => HEADLINES[Math.floor(Math.random() * HEADLINES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <>
      <style>{`
        @keyframes gs-glitch-entrance {
          0%   { clip-path: inset(0 0 100% 0); transform: translateX(0); filter: brightness(1); }
          3%   { clip-path: inset(20% 0 60% 0); transform: translateX(-4px); filter: brightness(2.5); }
          5%   { text-shadow: -8px 0 #ff0040, 8px 0 #00ffff; }
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
          58%  { clip-path: inset(65% 0 20% 0); transform: translateX(-1px); text-shadow: -4px 0 rgba(255,0,64,.5), 4px 0 rgba(0,255,255,.5); }
          60%  { clip-path: inset(0 0 0 0); transform: translateX(0); text-shadow: none; }
          72%  { clip-path: inset(30% 0 55% 0); transform: translateX(1px); }
          74%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          100% { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); text-shadow: none; }
        }
        @keyframes gs-glitch-idle {
          0%, 88%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
          89%      { clip-path: inset(60% 0 30% 0); transform: translateX(-1px); text-shadow: -2px 0 rgba(255,0,64,.4), 2px 0 rgba(0,255,255,.4); }
          90%      { clip-path: inset(0 0 0 0); transform: translateX(1px); }
          91%      { clip-path: inset(85% 0 5% 0); transform: translateX(0); }
          92%      { clip-path: inset(0 0 0 0); text-shadow: none; }
          100%     { clip-path: inset(0 0 0 0); transform: translateX(0); }
        }
        .gs-glitch-entrance { animation: gs-glitch-entrance 5s ease-out forwards; }
        .gs-glitch-idle     { animation: gs-glitch-idle 4s linear infinite; animation-delay: 5s; }
      `}</style>

      <div style={{
        minHeight: "100dvh",
        background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(37,99,235,0.08), rgb(10 13 20) 70%)",
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
            className="gs-glitch-entrance"
            style={{
              fontSize: "clamp(280px, 42vw, 520px)",
              fontWeight: 900,
              color: "rgba(255,255,255,0.09)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              display: "block",
            }}
          >
            <span className="gs-glitch-idle">404</span>
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
          boxShadow: "0 24px 64px rgba(0,0,0,0.55), inset 3px 0 0 0 var(--gg-primary, #2563eb)",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--gg-dim, rgb(134 150 168))",
            marginBottom: 14,
          }}>
            Error 404
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
            Double-check your URL or head back to the command center.
          </p>

          <Link href="/" style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "var(--gg-primary, #2563eb)",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}>
            ← Back to base
          </Link>

          <div style={{ marginTop: 14 }}>
            <a
              href="mailto:support@guerrillasuite.com"
              style={{
                fontSize: 13,
                color: "var(--gg-dim, rgb(134 150 168))",
                textDecoration: "none",
              }}
            >
              Contact support
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
