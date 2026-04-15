"use client";

import { useState, useCallback, useEffect } from "react";

type DomainRow = {
  id: string;
  domain: string;
  verified: boolean;
  verified_at: string | null;
  dns_records: DnsRecord[] | null;
  created_at: string;
};

type DnsRecord = {
  type: string;
  name: string;
  value: string;
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--gg-text-dim, #6b7280)",
  marginBottom: 5,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  background: "var(--gg-card, white)",
  border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 10,
  overflow: "hidden",
};

function StatusBadge({ verified }: { verified: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 700,
        background: verified ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.12)",
        color: verified ? "#16a34a" : "#d97706",
      }}
    >
      {verified ? "✓ Verified" : "⏳ Pending"}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{
        padding: "3px 10px",
        borderRadius: 5,
        border: "1px solid var(--gg-border, #e5e7eb)",
        background: copied ? "rgba(34,197,94,0.1)" : "transparent",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        color: copied ? "#16a34a" : "inherit",
        flexShrink: 0,
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function SendingDomainManager({
  initialDomains,
}: {
  initialDomains: DomainRow[];
}) {
  const [domains, setDomains] = useState(initialDomains);
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Background poll for unverified domains
  const pollVerification = useCallback(async (domainId: string) => {
    try {
      const res = await fetch(`/api/dispatch/domains/${domainId}/check`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        if (json.verified) {
          setDomains((prev) =>
            prev.map((d) => (d.id === domainId ? { ...d, verified: true, verified_at: new Date().toISOString() } : d))
          );
        }
      }
    } catch {
      // Silently ignore poll errors
    }
  }, []);

  // Poll unverified domains every 30s
  useEffect(() => {
    const unverified = domains.filter((d) => !d.verified);
    if (unverified.length === 0) return;

    const interval = setInterval(() => {
      unverified.forEach((d) => pollVerification(d.id));
    }, 30_000);

    return () => clearInterval(interval);
  }, [domains, pollVerification]);

  async function handleAddDomain() {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/dispatch/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add domain");
      setDomains((prev) => [...prev, json.domain]);
      setExpandedId(json.domain.id);
      setNewDomain("");
      setAddOpen(false);
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(domainId: string) {
    if (!confirm("Remove this sending domain? Any campaigns already sent will not be affected.")) return;
    setDeletingId(domainId);
    try {
      await fetch(`/api/dispatch/domains/${domainId}`, { method: "DELETE" });
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch {
      // Show nothing — rare
    } finally {
      setDeletingId(null);
    }
  }

  async function handleManualCheck(domainId: string) {
    await pollVerification(domainId);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* GS-managed default — always at the top, read-only */}
      <div style={cardStyle}>
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>groundgame.digital</span>
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 8,
                background: "rgba(37,99,235,0.1)",
                color: "var(--gg-primary, #2563eb)",
                fontWeight: 600,
              }}
            >
              GS Default
            </span>
          </div>
          <StatusBadge verified />
        </div>
        <div
          style={{
            padding: "8px 18px",
            borderTop: "1px solid var(--gg-border, #e5e7eb)",
            fontSize: 12,
            color: "var(--gg-text-dim, #6b7280)",
          }}
        >
          Managed by GuerrillaSuite — available to all tenants. No DNS setup required.
        </div>
      </div>

      {/* Client-owned domains */}
      {domains.map((d) => (
        <div key={d.id} style={cardStyle}>
          <div
            style={{
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => setExpandedId((e) => (e === d.id ? null : d.id))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 4,
                  color: "var(--gg-text-dim, #6b7280)",
                }}
                aria-label={expandedId === d.id ? "Collapse" : "Expand"}
              >
                {expandedId === d.id ? "▾" : "▸"}
              </button>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{d.domain}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge verified={d.verified} />
              {!d.verified && (
                <button
                  type="button"
                  onClick={() => handleManualCheck(d.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--gg-border, #e5e7eb)",
                    background: "transparent",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Check
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(d.id)}
                disabled={deletingId === d.id}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "transparent",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#ef4444",
                  cursor: deletingId === d.id ? "wait" : "pointer",
                }}
              >
                Remove
              </button>
            </div>
          </div>

          {/* DNS records (expanded) */}
          {expandedId === d.id && d.dns_records && d.dns_records.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--gg-border, #e5e7eb)",
                padding: "16px 18px",
              }}
            >
              {!d.verified && (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>
                    Add these DNS records to your domain registrar:
                  </p>

                  {/* Cloudflare fast path callout */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.3)",
                      fontSize: 12,
                      marginBottom: 12,
                    }}
                  >
                    <strong>Using Cloudflare?</strong> You can add these records automatically via
                    Resend's Domain Connect integration — no manual copy-paste needed.
                  </div>

                  <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--gg-text-dim, #6b7280)" }}>
                    ⏳ Verification typically takes minutes on Cloudflare, up to 24–48 hours on
                    other registrars. This page will update automatically when verified.
                  </p>
                </>
              )}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                <thead>
                  <tr>
                    {["Type", "Name", "Value", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "5px 10px",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--gg-text-dim, #6b7280)",
                          borderBottom: "1px solid var(--gg-border, #e5e7eb)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.dns_records.map((rec, i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{rec.type}</td>
                      <td
                        style={{
                          padding: "6px 10px",
                          fontFamily: "monospace",
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {rec.name}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          fontFamily: "monospace",
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {rec.value}
                      </td>
                      <td style={{ padding: "6px 10px" }}>
                        <CopyButton value={rec.value} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Add domain form */}
      {addOpen ? (
        <div style={{ ...cardStyle, padding: 20 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 14 }}>Add Sending Domain</p>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
            💡 We recommend using a subdomain like{" "}
            <code
              style={{
                background: "rgba(37,99,235,0.08)",
                padding: "1px 5px",
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              mail.yourdomain.com
            </code>{" "}
            to protect your main domain's email reputation.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Domain</label>
              <input
                style={inputStyle}
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="mail.yourdomain.com"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={handleAddDomain}
              disabled={adding || !newDomain.trim()}
              style={{
                padding: "9px 18px",
                borderRadius: 7,
                border: "none",
                background: adding || !newDomain.trim() ? "rgba(37,99,235,0.35)" : "var(--gg-primary, #2563eb)",
                color: "white",
                fontWeight: 600,
                fontSize: 14,
                cursor: adding || !newDomain.trim() ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {adding ? "Adding…" : "Add Domain"}
            </button>
            <button
              type="button"
              onClick={() => { setAddOpen(false); setAddError(null); }}
              style={{
                padding: "9px 14px",
                borderRadius: 7,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: "transparent",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          {addError && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#ef4444" }}>{addError}</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1.5px dashed var(--gg-border, #d1d5db)",
            background: "transparent",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            color: "var(--gg-text-dim, #6b7280)",
          }}
        >
          + Add Client Domain
        </button>
      )}
    </div>
  );
}
