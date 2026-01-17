// app/layout.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home as HomeIcon,
  Phone as DialsIcon,
  MapPin as DoorsIcon,
  User as AccountIcon,
} from "lucide-react";
import "./styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  
  // Check if we're on a survey page
  const isSurveyPage = pathname.startsWith('/survey');

  const isActive = React.useCallback(
    (href: string) =>
      href === "/app"
        ? pathname === "/app" || pathname === "/app/"
        : pathname.startsWith(href),
    [pathname]
  );

  React.useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--app-vh", `${vh}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--gg-bg", "rgb(10 12 17)");
    root.style.setProperty("--gg-card", "rgb(16 19 27)");
    root.style.setProperty("--gg-text", "rgb(236 240 245)");
    root.style.setProperty("--gg-dim", "rgb(160 170 186)");
    root.style.setProperty("--gg-primary", "#2563EB");
    root.style.setProperty("--gg-primary-pressed", "#1E4ED8");
    root.style.setProperty("--gg-border", "rgb(34 40 55)");
  }, []);

  // If it's a survey page, render without navigation
  if (isSurveyPage) {
    return (
      <html lang="en">
        <body>
          {children}
        </body>
      </html>
    );
  }

  // Regular layout with header and footer
  return (
    <html lang="en">
      <body>
        <section
          className="gg-app-shell"
          style={{
            minHeight: "calc(var(--app-vh, 1vh) * 100)",
            display: "flex",
            flexDirection: "column",
            background: "var(--gg-bg)",
            color: "var(--gg-text)",
          }}
        >
          <header
            className="gg-app-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--gg-border)",
              background: "var(--gg-bg)",
              position: "sticky",
              top: 0,
              zIndex: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                aria-label="GroundGame"
                style={{
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                GroundGame
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--gg-dim)",
                  lineHeight: 1,
                  marginTop: 2,
                }}
              >
                PWA
              </div>
            </div>

            <Link
              href="/crm"
              className="crm-fab"
              style={{
                textDecoration: "none",
                color: "var(--gg-text)",
                border: "1px solid var(--gg-border)",
                borderRadius: 10,
                padding: "6px 10px",
                fontSize: 12,
                opacity: 0.75,
              }}
            >
              CRM
            </Link>
          </header>

          <div
            className="gg-app-content"
            style={{
              flex: "1 1 auto",
              padding: "16px",
              paddingBottom:
                "calc(16px + env(safe-area-inset-bottom, 0px) + 64px)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {children}
          </div>

          <nav
            className="gg-app-footer"
            style={{
              position: "sticky",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 30,
              borderTop: "1px solid var(--gg-border)",
              background:
                "linear-gradient(180deg, rgba(10,12,17,0.9), rgba(10,12,17,1))",
              backdropFilter: "blur(6px)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 4,
                padding:
                  "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <FooterLink
                href="/app"
                label="Home"
                active={isActive("/app")}
                Icon={HomeIcon}
              />
              <FooterLink
                href="/dials"
                label="Dials"
                active={isActive("/dials")}
                Icon={DialsIcon}
              />
              <FooterLink
                href="/doors"
                label="Doors"
                active={isActive("/doors")}
                Icon={DoorsIcon}
              />
              <FooterLink
                href="/account"
                label="Account"
                active={isActive("/account")}
                Icon={AccountIcon}
              />
            </div>
          </nav>
        </section>
      </body>
    </html>
  );
}

function FooterLink({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="gg-footer-link"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        textDecoration: "none",
        background: active ? "var(--gg-card)" : "transparent",
        color: active ? "var(--gg-text)" : "var(--gg-dim)",
        padding: "8px 6px",
        borderRadius: 12,
        border: active ? "1px solid var(--gg-border)" : "1px solid transparent",
      }}
    >
      <Icon size={20} />
      <span style={{ fontSize: 11, lineHeight: 1 }}>{label}</span>
    </Link>
  );
}