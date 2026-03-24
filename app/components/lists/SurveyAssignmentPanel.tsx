"use client";

import { useState } from "react";

type CaptureMode = "none" | "survey" | "opportunity";

interface Props {
  listId: string;
  currentSurveyId: string | null;
  currentCaptureMode: string | null;
  surveys: Array<{ id: string; title: string }>;
}

export default function SurveyAssignmentPanel({
  listId,
  currentSurveyId,
  currentCaptureMode,
  surveys,
}: Props) {
  function initMode(): CaptureMode {
    if (currentCaptureMode === "opportunity") return "opportunity";
    if (currentCaptureMode === "survey" || currentSurveyId) return "survey";
    return "none";
  }

  const [mode, setMode] = useState<CaptureMode>(initMode);
  const [surveyId, setSurveyId] = useState(currentSurveyId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(nextMode: CaptureMode, nextSurveyId?: string) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/crm/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_capture_mode: nextMode === "none" ? null : nextMode,
          survey_id: nextMode === "survey" ? (nextSurveyId ?? surveyId) || null : null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  function handleModeChange(m: CaptureMode) {
    setMode(m);
    if (m !== "survey") save(m);
  }

  function handleSurveyChange(id: string) {
    setSurveyId(id);
    save("survey", id);
  }

  const btn = (m: CaptureMode, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => handleModeChange(m)}
      style={{
        flex: 1,
        padding: "8px 10px",
        borderRadius: 8,
        border: `1.5px solid ${mode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
        background: mode === m ? "rgba(37,99,235,0.08)" : "transparent",
        color: mode === m ? "var(--gg-primary, #2563eb)" : "inherit",
        fontWeight: mode === m ? 700 : 400,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        background: "var(--gg-card, white)",
        borderRadius: 10,
        padding: "14px 18px",
        border: "1px solid var(--gg-border, #e5e7eb)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Capture Mode</span>
        {status === "saving" && <span style={{ fontSize: 12, color: "#6b7280" }}>Saving…</span>}
        {status === "saved" && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Saved ✓</span>}
        {status === "error" && <span style={{ fontSize: 12, color: "#dc2626" }}>Error — retry</span>}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {btn("none", "None")}
        {btn("survey", "Survey")}
        {btn("opportunity", "Possible Opportunity")}
      </div>

      {mode === "survey" && (
        <select
          value={surveyId}
          onChange={(e) => handleSurveyChange(e.target.value)}
          disabled={status === "saving"}
          style={{
            padding: "7px 10px",
            borderRadius: 6,
            border: "1px solid var(--gg-border, #e5e7eb)",
            background: "var(--gg-card, white)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <option value="">(Select a survey)</option>
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      )}

      {mode === "opportunity" && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
          Field workers will be prompted to log a potential opportunity after each contact.
        </p>
      )}
    </div>
  );
}
