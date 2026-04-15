"use client";

import Link from "next/link";
import { useState } from "react";

export type CampaignStats = {
  total_sent: number;
  total_bounced: number;
  hard_bounced: number;
  soft_bounced: number;
  total_clicks: number;
  total_unsubscribes: number;
};

export type SendRow = {
  id: string;
  person_id: string;
  person_name: string;
  email_address: string;
  status: string;
  bounce_type: string | null;
  bounce_reason: string | null;
  clicked: boolean;
  unsubscribed: boolean;
  sent_at: string | null;
};

export type CampaignDetail = {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  status: string;
  audience_count: number | null;
  sent_at: string | null;
  scheduled_at: string | null;
  created_at: string;
};

interface Props {
  campaign: CampaignDetail;
  stats: CampaignStats;
  sends: SendRow[];
}

const statCard = (label: string, value: number, sub?: string, warn = false) => (
  <div
    style={{
      padding: "16px 20px",
      background: "var(--gg-card, white)",
      border: `1px solid ${warn && value > 0 ? "#fbbf24" : "var(--gg-border, #e5e7eb)"}`,
      borderRadius: 10,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    <span
      style={{
        fontSize: 28,
        fontWeight: 700,
        color: warn && value > 0 ? "#d97706" : "inherit",
        lineHeight: 1,
      }}
    >
      {value.toLocaleString()}
    </span>
    <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}>
      {label}
    </span>
    {sub && <span style={{ fontSize: 11, opacity: 0.5 }}>{sub}</span>}
  </div>
);

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--gg-text-dim, #6b7280)",
  borderBottom: "1px solid var(--gg-border, #e5e7eb)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid var(--gg-border, #e5e7eb)",
  fontSize: 13,
  verticalAlign: "middle",
};

function exportCsv(sends: SendRow[], campaignName: string) {
  const header = ["Name", "Email", "Status", "Bounce Type", "Bounce Reason", "Clicked", "Unsubscribed", "Sent At"];
  const rows = sends.map((s) => [
    s.person_name,
    s.email_address,
    s.status,
    s.bounce_type ?? "",
    s.bounce_reason ?? "",
    s.clicked ? "Yes" : "No",
    s.unsubscribed ? "Yes" : "No",
    s.sent_at ? new Date(s.sent_at).toLocaleString() : "",
  ]);
  const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${campaignName.replace(/[^a-z0-9]/gi, "-")}-results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CampaignResults({ campaign, stats, sends }: Props) {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const PER_PAGE = 100;

  const filtered =
    statusFilter === "all" ? sends : sends.filter((s) => s.status === statusFilter);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const visible = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const delivered = stats.total_sent - stats.total_bounced;
  const deliveryRate = stats.total_sent > 0
    ? Math.round((delivered / stats.total_sent) * 100)
    : 0;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Campaign header */}
      <div
        style={{
          background: "var(--gg-card, white)",
          border: "1px solid var(--gg-border, #e5e7eb)",
          borderRadius: 10,
          padding: "16px 20px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{campaign.subject}</h2>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
            From: {campaign.from_name} &lt;{campaign.from_email}&gt;
          </p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.5 }}>
            {campaign.sent_at
              ? `Sent ${new Date(campaign.sent_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
              : campaign.status === "scheduled" && campaign.scheduled_at
              ? `Scheduled for ${new Date(campaign.scheduled_at).toLocaleString()}`
              : `Status: ${campaign.status}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {campaign.status === "draft" && (
            <Link
              href={`/crm/dispatch/${campaign.id}/edit`}
              style={{
                padding: "8px 16px",
                borderRadius: 7,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: "transparent",
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Edit Draft
            </Link>
          )}
          {sends.length > 0 && (
            <button
              type="button"
              onClick={() => exportCsv(sends, campaign.name)}
              style={{
                padding: "8px 16px",
                borderRadius: 7,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: "transparent",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      {campaign.status === "sent" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {statCard("Sent", stats.total_sent)}
          {statCard("Delivered", delivered, `${deliveryRate}% delivery rate`)}
          {statCard("Bounced", stats.total_bounced, `${stats.hard_bounced} hard · ${stats.soft_bounced} soft`, true)}
          {statCard("Clicks", stats.total_clicks)}
          {statCard("Unsubscribes", stats.total_unsubscribes, undefined, stats.total_unsubscribes > 0)}
        </div>
      )}

      {/* Recipient table */}
      {sends.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Recipients</span>
            <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
              {filtered.length.toLocaleString()} total
            </span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              style={{
                padding: "5px 28px 5px 10px",
                borderRadius: 6,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: "var(--gg-input, white)",
                fontSize: 13,
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              <option value="all">All statuses</option>
              <option value="sent">Sent</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>
          </div>
          <div
            style={{
              background: "var(--gg-card, white)",
              border: "1px solid var(--gg-border, #e5e7eb)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Bounce Reason</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Clicked</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Unsub</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td style={tdStyle}>
                      <Link
                        href={`/crm/people/${s.person_id}`}
                        style={{ color: "var(--gg-primary, #2563eb)", textDecoration: "none", fontWeight: 500 }}
                      >
                        {s.person_name || "(No name)"}
                      </Link>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--gg-text-dim, #6b7280)" }}>{s.email_address}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background:
                            s.status === "sent"
                              ? "rgba(34,197,94,0.12)"
                              : s.status === "bounced"
                              ? "rgba(239,68,68,0.1)"
                              : "rgba(148,163,184,0.15)",
                          color:
                            s.status === "sent"
                              ? "#16a34a"
                              : s.status === "bounced"
                              ? "#dc2626"
                              : "#6b7280",
                        }}
                      >
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                      {s.bounce_reason ?? (s.bounce_type ? `${s.bounce_type} bounce` : "—")}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {s.clicked ? (
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
                      ) : (
                        <span style={{ opacity: 0.3 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {s.unsubscribed ? (
                        <span style={{ color: "#d97706", fontWeight: 700 }}>✓</span>
                      ) : (
                        <span style={{ opacity: 0.3 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--gg-border, #e5e7eb)",
                  background: "transparent",
                  cursor: page === 0 ? "default" : "pointer",
                  opacity: page === 0 ? 0.4 : 1,
                  fontSize: 13,
                }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 13, padding: "6px 8px", opacity: 0.7 }}>
                {page + 1} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--gg-border, #e5e7eb)",
                  background: "transparent",
                  cursor: page >= totalPages - 1 ? "default" : "pointer",
                  opacity: page >= totalPages - 1 ? 0.4 : 1,
                  fontSize: 13,
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {campaign.status === "sent" && sends.length === 0 && (
        <p style={{ textAlign: "center", opacity: 0.5, padding: "32px 0" }}>
          No send records found for this campaign.
        </p>
      )}

      {campaign.status === "draft" && (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            background: "var(--gg-card, white)",
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 10,
          }}
        >
          <p style={{ opacity: 0.6, marginBottom: 16 }}>
            This campaign is still a draft. Finish editing and send it to see results here.
          </p>
          <Link
            href={`/crm/dispatch/${campaign.id}/edit`}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "var(--gg-primary, #2563eb)",
              color: "white",
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Continue Editing →
          </Link>
        </div>
      )}
    </div>
  );
}
