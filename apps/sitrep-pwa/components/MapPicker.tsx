"use client";

import { useState, useEffect } from "react";

const S = {
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
} as const;

export function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || /^www\./i.test(str);
}

export function locationHref(str: string): string | null {
  if (!str) return null;
  if (isUrl(str)) return str.startsWith("http") ? str : "https://" + str;
  return null;
}

const MAP_APPS = [
  {
    id: "apple",
    label: "Apple Maps",
    emoji: "🗺️",
    href: (q: string) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "google",
    label: "Google Maps",
    emoji: "🌐",
    href: (q: string) =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
  },
  {
    id: "waze",
    label: "Waze",
    emoji: "🚗",
    href: (q: string) => `https://waze.com/ul?q=${encodeURIComponent(q)}`,
  },
  {
    id: "copy",
    label: "Copy Address",
    emoji: "📋",
    href: null,
  },
] as const;

interface MapPickerProps {
  location: string;
  onClose: () => void;
}

export default function MapPicker({ location, onClose }: MapPickerProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 240);
  }

  function handleApp(id: string, href: ((q: string) => string) | null) {
    if (id === "copy") {
      navigator.clipboard?.writeText(location).catch(() => {});
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        handleClose();
      }, 1100);
      return;
    }
    if (href) window.open(href(location), "_blank", "noopener,noreferrer");
    handleClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 400,
          background: "rgba(0,0,0,.55)",
          backdropFilter: "blur(4px)",
          opacity: visible ? 1 : 0,
          transition: "opacity .22s ease",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 401,
          background: "rgb(16 20 32)",
          borderRadius: "20px 20px 0 0",
          border: "1px solid rgba(255,255,255,.1)",
          boxShadow:
            "0 -8px 48px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform .24s cubic-bezier(0.32,0.72,0,1)",
          paddingBottom: 28,
        }}
      >
        {/* Handle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 22,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,.2)",
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            padding: "2px 20px 14px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: S.dim,
              marginBottom: 4,
            }}
          >
            Open Location In
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: S.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {location}
          </div>
        </div>

        {/* App rows */}
        <div style={{ padding: "4px 14px 0" }}>
          {MAP_APPS.map((app, i) => (
            <button
              key={app.id}
              onClick={() => handleApp(app.id, app.href as ((q: string) => string) | null)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 8px",
                background: "none",
                border: "none",
                borderBottom:
                  i < MAP_APPS.length - 1
                    ? "1px solid rgba(255,255,255,.05)"
                    : "none",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 8,
                transition: "background .1s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,.04)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "none")
              }
            >
              <span style={{ fontSize: 22, width: 36, textAlign: "center", flexShrink: 0 }}>
                {app.emoji}
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color:
                    app.id === "copy" && copied ? "#86efac" : S.text,
                  flex: 1,
                }}
              >
                {app.id === "copy" && copied ? "Copied!" : app.label}
              </span>
              {app.id !== "copy" && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={S.dim}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div style={{ padding: "10px 14px 0" }}>
          <button
            onClick={handleClose}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.08)",
              color: S.dimBright,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background .1s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,.1)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,.06)")
            }
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
