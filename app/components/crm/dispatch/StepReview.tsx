"use client";

import { useState } from "react";
import type { DetailsData } from "./StepDetails";
import type { AudienceData } from "./StepAudience";

interface Props {
  details: DetailsData;
  audience: AudienceData;
  audienceCount: number | null;
  htmlBody: string;
  onSendNow: () => Promise<void>;
  onSchedule: (scheduledAt: string) => Promise<void>;
  sending: boolean;
  campaignId: string | null;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 0",
  borderBottom: "1px solid var(--gg-border, #e5e7eb)",
  fontSize: 14,
};

const dimStyle: React.CSSProperties = {
  color: "var(--gg-text-dim, #6b7280)",
  flexShrink: 0,
  minWidth: 120,
};

export default function StepReview({
  details,
  audience,
  audienceCount,
  htmlBody,
  onSendNow,
  onSchedule,
  sending,
  campaignId,
}: Props) {
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"now" | "schedule">("now");
  const [previewOpen, setPreviewOpen] = useState(false);

  const fromEmail = `${details.from_local}@${details.from_domain}`;

  async function handleConfirm() {
    setConfirmOpen(false);
    if (confirmAction === "now") {
      await onSendNow();
    } else {
      await onSchedule(scheduledAt);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Review & Send</h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
          Double-check everything before sending.
        </p>
      </div>

      {/* Summary card */}
      <div
        style={{
          background: "var(--gg-card, white)",
          border: "1px solid var(--gg-border, #e5e7eb)",
          borderRadius: 10,
          padding: "4px 20px 12px",
        }}
      >
        <div style={rowStyle}>
          <span style={dimStyle}>Campaign Name</span>
          <span style={{ fontWeight: 500 }}>{details.name}</span>
        </div>
        <div style={rowStyle}>
          <span style={dimStyle}>Subject</span>
          <span style={{ fontWeight: 500 }}>{details.subject}</span>
        </div>
        {details.preview_text && (
          <div style={rowStyle}>
            <span style={dimStyle}>Preview Text</span>
            <span style={{ opacity: 0.8 }}>{details.preview_text}</span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={dimStyle}>From</span>
          <span>
            {details.from_name} &lt;{fromEmail}&gt;
          </span>
        </div>
        {details.reply_to && (
          <div style={rowStyle}>
            <span style={dimStyle}>Reply-To</span>
            <span>{details.reply_to}</span>
          </div>
        )}
        <div style={{ ...rowStyle, borderBottom: "none" }}>
          <span style={dimStyle}>Recipients</span>
          <span style={{ fontWeight: 600 }}>
            {audienceCount != null ? (
              <>
                {audienceCount.toLocaleString()} recipient{audienceCount !== 1 ? "s" : ""}
                <span style={{ fontWeight: 400, color: "var(--gg-text-dim, #6b7280)", marginLeft: 8 }}>
                  ({audience.audience_type === "list" ? "from walklist" : "filtered segment"})
                </span>
              </>
            ) : (
              <span style={{ color: "var(--gg-text-dim, #6b7280)" }}>
                Count not calculated — go back to Audience step
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Email preview */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Email Preview</span>
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            style={{
              padding: "6px 12px",
              borderRadius: 7,
              border: "1px solid var(--gg-border, #e5e7eb)",
              background: "transparent",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {previewOpen ? "Hide Preview" : "Show Preview"}
          </button>
        </div>
        {previewOpen && htmlBody && (
          <iframe
            srcDoc={htmlBody}
            style={{
              width: "100%",
              height: 500,
              border: "1px solid var(--gg-border, #e5e7eb)",
              borderRadius: 8,
            }}
            sandbox="allow-same-origin"
            title="Email Preview"
          />
        )}
      </div>

      {/* Send options */}
      <div
        style={{
          background: "var(--gg-card, white)",
          border: "1px solid var(--gg-border, #e5e7eb)",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <p style={{ margin: "0 0 16px", fontWeight: 600, fontSize: 14 }}>Send Options</p>
        <div style={{ display: "flex", gap: 8, marginBottom: scheduleMode ? 16 : 0 }}>
          <button
            type="button"
            onClick={() => setScheduleMode(false)}
            style={{
              padding: "9px 20px",
              borderRadius: 7,
              border: scheduleMode ? "1px solid var(--gg-border, #e5e7eb)" : "none",
              background: !scheduleMode ? "var(--gg-primary, #2563eb)" : "var(--gg-card, white)",
              color: !scheduleMode ? "white" : "inherit",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Send Now
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode(true)}
            style={{
              padding: "9px 20px",
              borderRadius: 7,
              border: scheduleMode ? "none" : "1px solid var(--gg-border, #e5e7eb)",
              background: scheduleMode ? "var(--gg-primary, #2563eb)" : "transparent",
              color: scheduleMode ? "white" : "inherit",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Schedule
          </button>
        </div>

        {scheduleMode && (
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                marginBottom: 5,
                color: "var(--gg-text-dim, #6b7280)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Send At
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: 7,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: "var(--gg-input, white)",
                fontSize: 14,
              }}
            />
          </div>
        )}

        <button
          type="button"
          disabled={sending || (scheduleMode && !scheduledAt)}
          onClick={() => {
            setConfirmAction(scheduleMode ? "schedule" : "now");
            setConfirmOpen(true);
          }}
          style={{
            padding: "11px 24px",
            borderRadius: 8,
            border: "none",
            background:
              sending || (scheduleMode && !scheduledAt)
                ? "rgba(37,99,235,0.35)"
                : "#16a34a",
            color: "white",
            fontWeight: 700,
            fontSize: 15,
            cursor: sending || (scheduleMode && !scheduledAt) ? "not-allowed" : "pointer",
          }}
        >
          {sending
            ? "Sending…"
            : scheduleMode
            ? "Schedule Campaign"
            : "Send Campaign"}
        </button>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            style={{
              background: "var(--gg-card, white)",
              borderRadius: 14,
              padding: 28,
              width: "100%",
              maxWidth: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontWeight: 700 }}>
              {confirmAction === "now" ? "Send Campaign?" : "Schedule Campaign?"}
            </h3>
            <p style={{ margin: "0 0 24px", color: "var(--gg-text-dim, #6b7280)", fontSize: 14 }}>
              {confirmAction === "now" ? (
                <>
                  You are about to send to{" "}
                  <strong>{(audienceCount ?? 0).toLocaleString()} recipients</strong>. This cannot
                  be undone.
                </>
              ) : (
                <>
                  This campaign will be sent on{" "}
                  <strong>{new Date(scheduledAt).toLocaleString()}</strong> to{" "}
                  <strong>{(audienceCount ?? 0).toLocaleString()} recipients</strong>.
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 1,
                  padding: "11px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#16a34a",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {confirmAction === "now" ? "Yes, Send Now" : "Yes, Schedule It"}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  padding: "11px 16px",
                  borderRadius: 8,
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
          </div>
        </div>
      )}
    </div>
  );
}
