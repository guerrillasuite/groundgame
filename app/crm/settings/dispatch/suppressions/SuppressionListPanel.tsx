"use client";

import { useState } from "react";

type Row = {
  id: string;
  email_address: string;
  person_id: string | null;
  unsubscribed_at: string;
  campaign_id: string | null;
};

interface Props {
  rows: Row[];
  tenantId: string;
}

export default function SuppressionListPanel({ rows: initialRows, tenantId }: Props) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [removing, setRemoving] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeOne(id: string) {
    setRemoving(id);
    setError(null);
    const res = await fetch(`/api/dispatch/suppressions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((r) => r.filter((x) => x.id !== id));
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to remove entry");
    }
    setRemoving(null);
  }

  async function clearAll() {
    if (!confirm(`Remove all ${rows.length} suppression entries? This cannot be undone.`)) return;
    setClearingAll(true);
    setError(null);
    const res = await fetch("/api/dispatch/suppressions", { method: "DELETE" });
    if (res.ok) {
      setRows([]);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to clear suppression list");
    }
    setClearingAll(false);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,.1)", border: "1px solid #ef4444",
          color: "#b91c1c", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{
          padding: "32px 24px", textAlign: "center",
          background: "var(--gg-card, white)",
          border: "1px solid var(--gg-border, #e5e7eb)",
          borderRadius: 10, color: "var(--gg-text-dim, #6b7280)", fontSize: 14,
        }}>
          No suppressed addresses. Your full contact list is eligible for campaigns.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>
              {rows.length.toLocaleString()} suppressed address{rows.length !== 1 ? "es" : ""}
            </span>
            <button
              onClick={clearAll}
              disabled={clearingAll}
              style={{
                padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer",
                background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.35)",
                color: "#b91c1c", fontWeight: 600,
              }}
            >
              {clearingAll ? "Clearing…" : "Clear All"}
            </button>
          </div>

          <div style={{
            background: "var(--gg-card, white)",
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--gg-surface, #f9fafb)", borderBottom: "1px solid var(--gg-border, #e5e7eb)" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Email</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Source</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--gg-border, #e5e7eb)" }}>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{row.email_address}</td>
                    <td style={{ padding: "10px 16px", color: "var(--gg-text-dim, #6b7280)" }}>
                      {new Date(row.unsubscribed_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--gg-text-dim, #6b7280)" }}>
                      {row.campaign_id ? "Campaign unsubscribe / bounce" : "Manual"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => removeOne(row.id)}
                        disabled={removing === row.id}
                        style={{
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                          background: "none", border: "1px solid var(--gg-border, #e5e7eb)",
                          color: "var(--gg-text-dim, #6b7280)",
                        }}
                      >
                        {removing === row.id ? "…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
