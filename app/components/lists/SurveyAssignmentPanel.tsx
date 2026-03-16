"use client";

import { useState } from "react";

interface Props {
  listId: string;
  currentSurveyId: string | null;
  surveys: Array<{ id: string; title: string }>;
}

export default function SurveyAssignmentPanel({ listId, currentSurveyId, surveys }: Props) {
  const [selected, setSelected] = useState(currentSurveyId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleChange(surveyId: string) {
    setSelected(surveyId);
    setStatus("saving");
    try {
      const res = await fetch(`/api/crm/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_id: surveyId || null }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      style={{
        background: "var(--gg-card, white)",
        borderRadius: 10,
        padding: "14px 18px",
        border: "1px solid var(--gg-border, #e5e7eb)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
        Linked Survey
      </span>
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={status === "saving"}
        style={{
          flex: 1,
          padding: "7px 10px",
          borderRadius: 6,
          border: "1px solid var(--gg-border, #e5e7eb)",
          background: "var(--gg-card, white)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <option value="">(No survey assigned)</option>
        {surveys.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      {status === "saving" && (
        <span style={{ fontSize: 12, color: "#6b7280" }}>Saving…</span>
      )}
      {status === "saved" && (
        <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Saved ✓</span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 12, color: "#dc2626" }}>Error — retry</span>
      )}
    </div>
  );
}
