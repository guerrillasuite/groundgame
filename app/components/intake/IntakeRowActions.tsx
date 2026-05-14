"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  surveyId: string;
  surveyTitle: string;
}

export default function IntakeRowActions({ surveyId, surveyTitle }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDuplicate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${surveyId}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Duplicate failed");
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
      if (!res.ok) throw new Error("Archive failed");
      router.refresh();
    } catch {
      alert("Failed to archive. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const btnStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, padding: "5px 10px",
    borderRadius: 6, textDecoration: "none",
    border: "1px solid var(--gg-border, #e5e7eb)",
    background: "none", cursor: busy ? "not-allowed" : "pointer",
    color: "inherit", opacity: busy ? 0.5 : 1,
  };

  return (
    <>
      <button type="button" onClick={handleDuplicate} disabled={busy} style={btnStyle}>
        Copy
      </button>
      <button type="button" onClick={handleArchive} disabled={busy} style={{ ...btnStyle, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}>
        Archive
      </button>
    </>
  );
}
