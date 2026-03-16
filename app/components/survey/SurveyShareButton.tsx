"use client";

import { useState } from "react";
import { Share2, X } from "lucide-react";

interface Props {
  surveyId: string;
}

export default function SurveyShareButton({ surveyId }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${surveyId}`
      : `/s/${surveyId}`;
  const embedCode = `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0" style="border:none;"></iframe>`;

  function copyText(text: string, which: "link" | "embed") {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "link") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedEmbed(true);
        setTimeout(() => setCopiedEmbed(false), 2000);
      }
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "10px 16px",
          background: "rgba(0,0,0,0.05)",
          color: "inherit",
          borderRadius: 8,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
        }}
      >
        <Share2 size={15} />
        Share
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            background: "var(--gg-card, white)",
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 10,
            padding: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>Share / Embed</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Public link */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 6, textTransform: "uppercase" }}>
              Public Link
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                value={publicUrl}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--gg-border, #e5e7eb)",
                  fontSize: 12,
                  background: "rgba(0,0,0,0.03)",
                  fontFamily: "monospace",
                }}
              />
              <button
                onClick={() => copyText(publicUrl, "link")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 6,
                  background: copiedLink ? "#dcfce7" : "#2563eb",
                  color: copiedLink ? "#166534" : "white",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {copiedLink ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>

          {/* Embed code */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 6, textTransform: "uppercase" }}>
              Embed Code
            </div>
            <textarea
              readOnly
              value={embedCode}
              rows={3}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--gg-border, #e5e7eb)",
                fontSize: 11,
                background: "rgba(0,0,0,0.03)",
                fontFamily: "monospace",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => copyText(embedCode, "embed")}
              style={{
                marginTop: 6,
                padding: "7px 12px",
                borderRadius: 6,
                background: copiedEmbed ? "#dcfce7" : "rgba(0,0,0,0.05)",
                color: copiedEmbed ? "#166534" : "inherit",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {copiedEmbed ? "Copied ✓" : "Copy Embed Code"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
