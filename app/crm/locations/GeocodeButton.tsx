"use client";

import { useState } from "react";

export default function GeocodeButton() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<{ total: number; geocoded: number; failed: number; skipped: number } | null>(null);

  async function run() {
    setStatus("running");
    setResult(null);
    try {
      const res = await fetch("/api/crm/locations/geocode", { method: "POST" });
      const data = await res.json();
      setResult(data);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        onClick={run}
        disabled={status === "running"}
        style={{
          padding: "8px 16px",
          background: status === "running" ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)",
          color: "white",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
          border: "none",
          cursor: status === "running" ? "not-allowed" : "pointer",
          opacity: status === "running" ? 0.7 : 1,
        }}
      >
        {status === "running" ? "Geocoding…" : "Fill Missing Coordinates"}
      </button>

      {status === "done" && result && (
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {result.total === 0
            ? "✓ No locations missing coordinates"
            : `✓ ${result.geocoded} geocoded, ${result.failed} not found${result.skipped > 0 ? ` (${result.skipped} more — run again)` : ""}`}
        </span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 13, color: "#ef4444" }}>Request failed — check console</span>
      )}
    </div>
  );
}
