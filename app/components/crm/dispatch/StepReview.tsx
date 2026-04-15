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
  borderBottom: "1px solid rgb(var(--border-600))",
  fontSize: 14,
};

const dimStyle: React.CSSProperties = {
  color: "rgb(var(--text-300))",
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

  const canSend = !sending && (!scheduleMode || !!scheduledAt);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Review & Send</h2>
        <p style={{ margin: 0, fontSize: 13, color: "rgb(var(--text-300))" }}>
          Double-check everything before sending.
        </p>
      </div>

      {/* Summary card */}
      <div
        style={{
          background: "rgb(var(--card-700))",
          border: "1px solid rgb(var(--border-600))",
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
                <span style={{ fontWeight: 400, color: "rgb(var(--text-300))", marginLeft: 8 }}>
                  ({audience.audience_type === "list" ? "from walklist" : "filtered segment"})
                </span>
              </>
            ) : (
              <span style={{ color: "rgb(var(--text-300))" }}>
                Count not calculated — go back to Audience step
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Email preview */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Email Preview</span>
          <button
            type="button"
            className="gg-btn-ghost"
            onClick={() => setPreviewOpen((o) => !o)}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            {previewOpen ? "Hide" : "Show"}
          </button>
        </div>
        {previewOpen && htmlBody && (
          <iframe
            srcDoc={htmlBody}
            style={{
              width: "100%",
              height: 500,
              border: "1px solid rgb(var(--border-600))",
              borderRadius: 8,
            }}
            sandbox="allow-same-origin"
            title="Email Preview"
          />
        )}
      </div>

      {/* Send options */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        {/* Mode toggles */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={!scheduleMode ? "gg-btn-tab-active" : "gg-btn-tab"}
            onClick={() => setScheduleMode(false)}
          >
            Send Now
          </button>
          <button
            type="button"
            className={scheduleMode ? "gg-btn-tab-active" : "gg-btn-tab"}
            onClick={() => setScheduleMode(true)}
          >
            Schedule
          </button>
        </div>

        {/* Datetime input — only shown in schedule mode */}
        {scheduleMode && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={{
              padding: "9px 12px",
              borderRadius: 7,
              border: "1px solid rgb(var(--border-600))",
              background: "rgb(var(--surface-800))",
              color: "rgb(var(--text-100))",
              fontSize: 14,
            }}
          />
        )}

        {/* Send button */}
        <button
          type="button"
          className="gg-btn-success"
          disabled={!canSend}
          onClick={() => {
            setConfirmAction(scheduleMode ? "schedule" : "now");
            setConfirmOpen(true);
          }}
        >
          {sending ? "Sending…" : scheduleMode ? "Schedule Campaign" : "Send Campaign"}
        </button>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
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
              background: "rgb(var(--card-700))",
              border: "1px solid rgb(var(--border-600))",
              borderRadius: 14,
              padding: 28,
              width: "100%",
              maxWidth: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontWeight: 700 }}>
              {confirmAction === "now" ? "Send Campaign?" : "Schedule Campaign?"}
            </h3>
            <p style={{ margin: "0 0 24px", color: "rgb(var(--text-300))", fontSize: 14 }}>
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
              <button className="gg-btn-success" onClick={handleConfirm} style={{ flex: 1, fontSize: 14 }}>
                {confirmAction === "now" ? "Yes, Send Now" : "Yes, Schedule It"}
              </button>
              <button className="gg-btn-ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
