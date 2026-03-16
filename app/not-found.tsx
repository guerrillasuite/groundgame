"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "rgb(var(--bg-900, 10 12 17))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      fontFamily: "sans-serif",
    }}>
      <div style={{ textAlign: "center", color: "rgb(var(--text-100, 240 242 248))" }}>
        <div style={{ fontSize: "64px", fontWeight: 700, opacity: 0.2 }}>404</div>
        <h1 style={{ margin: "8px 0", fontSize: "24px", fontWeight: 600 }}>Page not found</h1>
        <p style={{ margin: "0 0 24px", color: "rgb(var(--text-300, 140 150 170))", fontSize: "15px" }}>
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "#2563EB",
          color: "#fff",
          borderRadius: "8px",
          textDecoration: "none",
          fontSize: "14px",
          fontWeight: 500,
        }}>
          Go home
        </Link>
      </div>
    </div>
  );
}
