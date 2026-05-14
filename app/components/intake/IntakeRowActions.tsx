"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  surveyId: string;
  surveyTitle: string;
}

const btn: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: "4px 7px",
  borderRadius: 5, border: "1px solid var(--gg-border, rgb(52 64 84))",
  background: "none", cursor: "pointer", whiteSpace: "nowrap",
  textDecoration: "none", display: "inline-flex", alignItems: "center",
  color: "rgb(var(--text-100))", lineHeight: 1.4, flexShrink: 0,
};

export default function IntakeRowActions({ surveyId, surveyTitle }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDuplicate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${surveyId}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { survey_id } = await res.json();
      router.push(`/crm/intake/${survey_id}/edit`);
    } catch {
      alert("Failed to duplicate. Please try again.");
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (busy) return;
    if (!confirm(`Archive "${surveyTitle}"? It will be set to Closed and stop accepting responses.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed", active_channels: [] }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Failed to archive. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/s/${surveyId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const disabledStyle: React.CSSProperties = busy ? { opacity: 0.5, cursor: "not-allowed" } : {};

  return (
    <>
      <a
        href={`/s/${surveyId}?preview=1`}
        target="_blank"
        rel="noopener noreferrer"
        className="gg-row-btn"
        style={btn}
      >
        Preview
      </a>
      <button
        type="button"
        className="gg-row-btn"
        onClick={handleShare}
        style={{ ...btn, ...(copied ? { borderColor: "rgba(22,163,74,0.5)", color: "#4ade80" } : {}) }}
      >
        {copied ? "Copied!" : "Share"}
      </button>
      <a
        href={`/crm/intake/${surveyId}/edit`}
        className="gg-row-btn"
        style={btn}
      >
        Edit
      </a>
      <a
        href={`/crm/intake/${surveyId}/results`}
        className="gg-row-btn-primary"
        style={{ ...btn, background: "var(--gg-primary, #2563eb)", color: "white", border: "none" }}
      >
        Results
      </a>
      <button
        type="button"
        className="gg-row-btn"
        onClick={handleDuplicate}
        disabled={busy}
        style={{ ...btn, ...disabledStyle }}
      >
        Copy
      </button>
      <button
        type="button"
        className="gg-row-btn-danger"
        onClick={handleArchive}
        disabled={busy}
        style={{ ...btn, color: "#f87171", borderColor: "rgba(248,113,113,0.25)", ...disabledStyle }}
      >
        Archive
      </button>
    </>
  );
}
