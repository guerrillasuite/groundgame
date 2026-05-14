"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export default function LoadTemplatesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLoad() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/intake/apply-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to load templates");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={handleLoad}
        disabled={loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "10px 20px",
          background: "transparent",
          color: "var(--gg-primary, #2563eb)",
          border: "1px solid var(--gg-primary, #2563eb)",
          borderRadius: 8, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          fontSize: 14, opacity: loading ? 0.6 : 1,
        }}
      >
        <Sparkles size={15} /> {loading ? "Loading templates…" : "Load starter templates"}
      </button>
      {error && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#dc2626" }}>{error}</p>}
    </div>
  );
}
