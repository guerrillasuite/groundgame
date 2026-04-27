"use client";

import { useMemo } from "react";
import Link from "next/link";

const ROLE_HEADLINES = [
  "You haven't been cleared for this sector.",
  "Access denied. This area is Director-only.",
  "Wrong clearance level for this zone.",
];

const TENANT_HEADLINES = [
  "You're not authorized in this territory.",
  "This isn't your operation.",
  "Wrong org. Wrong sector.",
];

interface AccessWallProps {
  type: "feature" | "role" | "superadmin" | "tenant";
  userIsAdmin?: boolean;
  featureName?: string;
  headlineOverride?: string;
}

export default function AccessWall({
  type,
  userIsAdmin = false,
  featureName,
  headlineOverride,
}: AccessWallProps) {
  const headline = useMemo(() => {
    if (headlineOverride) return headlineOverride;
    if (type === "superadmin") return "Way above your pay grade.";
    if (type === "tenant") {
      return TENANT_HEADLINES[Math.floor(Math.random() * TENANT_HEADLINES.length)];
    }
    if (type === "role") {
      return ROLE_HEADLINES[Math.floor(Math.random() * ROLE_HEADLINES.length)];
    }
    // feature
    if (userIsAdmin) return `${featureName ?? "This feature"} isn't on your current plan.`;
    return "You haven't been cleared for this sector.";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eyebrow =
    type === "superadmin"   ? "RESTRICTED"        :
    type === "tenant"       ? "WRONG TERRITORY"   :
    type === "feature" && userIsAdmin ? "PLAN REQUIRED"   :
    "ACCESS RESTRICTED";

  const sub =
    type === "superadmin"
      ? "This area is restricted to GuerrillaSuite system administrators."
      : type === "tenant"
      ? "You don't have access to this organization's account. Return to your own dashboard."
      : type === "role"
      ? "This area requires Director-level access. If you think this is a mistake, contact your Director."
      : type === "feature" && userIsAdmin
      ? "Reach out to GuerrillaSuite to add it to your account."
      : "This feature isn't part of your current access level. Talk to your Director to find out more.";

  const isTenant = type === "tenant";
  const isAdminFeature = type === "feature" && userIsAdmin;
  const isRoleOrSuperAdmin = type === "role" || type === "superadmin";
  const showDashboardBtn = isRoleOrSuperAdmin || isAdminFeature;

  const ambientIcon = type === "feature" ? "🛡" : "🔒";
  const accentColor = type === "tenant" ? "#f59e0b" : "var(--gg-primary, #2563eb)";
  const bloomColor = type === "tenant" ? "rgba(245,158,11,0.06)" : "rgba(37,99,235,0.07)";

  return (
    <div style={{
      minHeight: "70vh",
      background: `radial-gradient(ellipse 50% 50% at 50% 40%, ${bloomColor}, transparent 70%)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      position: "relative",
    }}>
      {/* Ambient background icon */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          fontSize: 72,
          opacity: 0.06,
          userSelect: "none",
          pointerEvents: "none",
          color: accentColor,
          zIndex: 0,
        }}
      >
        {ambientIcon}
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
        boxShadow: `0 16px 48px rgba(0,0,0,0.4), inset 3px 0 0 0 ${accentColor}`,
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--gg-dim, rgb(134 150 168))",
          marginBottom: 12,
        }}>
          {eyebrow}
        </div>

        <h2 style={{
          margin: "0 0 10px",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--gg-text, rgb(238 242 246))",
          lineHeight: 1.3,
        }}>
          {headline}
        </h2>

        <p style={{
          margin: "0 0 24px",
          fontSize: 13,
          color: "var(--gg-dim, rgb(134 150 168))",
          lineHeight: 1.6,
        }}>
          {sub}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          {(isTenant || isAdminFeature) && (
            <Link href="/crm" style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              background: "var(--gg-primary, #2563eb)",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}>
              {isTenant ? "Go to my dashboard" : "Go to my dashboard"}
            </Link>
          )}

          {isAdminFeature && (
            <a
              href="mailto:support@guerrillasuite.com"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "9px 18px",
                background: "transparent",
                color: "var(--gg-dim, rgb(134 150 168))",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Contact GuerrillaSuite →
            </a>
          )}

          {showDashboardBtn && (
            <Link href="/crm" style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              background: "transparent",
              color: "var(--gg-dim, rgb(134 150 168))",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
            }}>
              ← Back to dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
