"use client";

import Link from "next/link";
import { useState } from "react";

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  audience_count: number | null;
  from_name: string;
  from_email: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<Campaign["status"], { bg: string; text: string }> = {
  draft:     { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
  scheduled: { bg: "rgba(251,191,36,0.12)",  text: "#d97706" },
  sending:   { bg: "rgba(59,130,246,0.12)",  text: "#2563eb" },
  sent:      { bg: "rgba(34,197,94,0.12)",   text: "#16a34a" },
  cancelled: { bg: "rgba(239,68,68,0.1)",    text: "#dc2626" },
};

const STATUS_LABELS: Record<Campaign["status"], string> = {
  draft:     "Draft",
  scheduled: "Scheduled",
  sending:   "Sending…",
  sent:      "Sent",
  cancelled: "Cancelled",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  const [filter, setFilter] = useState<Campaign["status"] | "all">("all");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/dispatch/campaign/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletedIds((prev) => new Set([...prev, id]));
      }
    } finally {
      setDeleting(false);
      setConfirmingId(null);
    }
  }

  const visible = (filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter))
    .filter((c) => !deletedIds.has(c.id));

  const counts = campaigns.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const tabs: Array<{ key: Campaign["status"] | "all"; label: string }> = [
    { key: "all",       label: `All (${campaigns.length})` },
    { key: "draft",     label: `Drafts (${counts.draft ?? 0})` },
    { key: "scheduled", label: `Scheduled (${counts.scheduled ?? 0})` },
    { key: "sent",      label: `Sent (${counts.sent ?? 0})` },
  ];

  if (campaigns.length === 0) {
    return (
      <div
        style={{
          background: "rgb(var(--card-700))",
          borderRadius: 12,
          padding: 56,
          textAlign: "center",
          border: "1px solid rgb(var(--border-600))",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No campaigns yet</h3>
        <p style={{ opacity: 0.7, marginBottom: 24 }}>
          Create your first email campaign to start reaching your contacts.
        </p>
        <Link
          href="/crm/dispatch/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 20px",
            background: "var(--gg-primary, #2563eb)",
            color: "white",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          + New Campaign
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Tab filter */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "1px solid rgb(var(--border-600))",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "8px 14px",
              border: "none",
              borderBottom: filter === tab.key ? "2px solid rgb(var(--primary-600))" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: filter === tab.key ? 600 : 400,
              color: filter === tab.key ? "rgb(var(--primary-500))" : "rgb(var(--text-300))",
              marginBottom: -1,
              transition: "color .12s ease, border-color .12s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Campaign rows */}
      <div style={{ display: "grid", gap: 8 }}>
        {visible.map((c) => {
          const colors = STATUS_COLORS[c.status];
          const href =
            c.status === "draft" ? `/crm/dispatch/${c.id}/edit` : `/crm/dispatch/${c.id}`;
          return (
            <Link
              key={c.id}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 18px",
                background: "rgb(var(--card-700))",
                border: "1px solid rgb(var(--border-600))",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {/* Status badge */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 9px",
                  borderRadius: 10,
                  background: colors.bg,
                  color: colors.text,
                  minWidth: 70,
                  textAlign: "center",
                }}
              >
                {STATUS_LABELS[c.status]}
              </span>

              {/* Campaign info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.6,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginTop: 2,
                  }}
                >
                  {c.subject}
                </div>
              </div>

              {/* From */}
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                  minWidth: 160,
                  flexShrink: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.from_name}
              </div>

              {/* Recipients */}
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                  minWidth: 80,
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {c.audience_count != null ? `${c.audience_count.toLocaleString()} rcpts` : "—"}
              </div>

              {/* Date */}
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.6,
                  minWidth: 90,
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {formatDate(c.sent_at ?? c.scheduled_at ?? c.created_at)}
              </div>

              {/* Delete */}
              {c.status !== "sending" && (
                confirmingId === c.id ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                    onClick={(e) => e.preventDefault()}
                  >
                    <span style={{ fontSize: 12, color: "rgb(var(--text-300))" }}>Delete?</span>
                    <button
                      onClick={(e) => { e.preventDefault(); handleDelete(c.id); }}
                      disabled={deleting}
                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, border: "none", background: "#dc2626", color: "white", cursor: "pointer", fontWeight: 600 }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); setConfirmingId(null); }}
                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, border: "1px solid rgb(var(--border-600))", background: "transparent", color: "rgb(var(--text-300))", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.preventDefault(); setConfirmingId(c.id); }}
                    style={{ flexShrink: 0, padding: "4px 8px", border: "none", background: "transparent", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#dc2626", opacity: 0.6 }}
                    title="Delete campaign"
                  >
                    🗑
                  </button>
                )
              )}
            </Link>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p style={{ textAlign: "center", opacity: 0.5, padding: "32px 0" }}>
          No {filter} campaigns.
        </p>
      )}
    </div>
  );
}
