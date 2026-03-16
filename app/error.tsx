"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        <div style={{ fontSize: "48px", opacity: 0.2 }}>⚠</div>
        <h1 style={{ margin: "8px 0", fontSize: "24px", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ margin: "0 0 24px", color: "rgb(var(--text-300, 140 150 170))", fontSize: "15px" }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 20px",
            background: "#2563EB",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
