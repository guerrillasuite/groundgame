"use client";

import { useRef, useState } from "react";

const TAGS = [
  { label: "First Name",    value: "{First_Name}" },
  { label: "Last Name",     value: "{Last_Name}" },
  { label: "Full Name",     value: "{Full_Name}" },
  { label: "Phone",         value: "{Phone}" },
  { label: "Survey Link",   value: "{Survey_Link}" },
  { label: "Person ID",     value: "{Person_ID}" },
];

interface Props {
  listId: string;
  initialScript: string | null;
  surveySlug: string | null;
}

export default function TextScriptEditor({ listId, initialScript, surveySlug }: Props) {
  const [script, setScript] = useState(initialScript ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function save(value: string) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/crm/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  function insertTag(tag: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? script.length;
    const end = el.selectionEnd ?? script.length;
    const next = script.slice(0, start) + tag + script.slice(end);
    setScript(next);
    // Restore cursor after the inserted tag
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  return (
    <div style={{
      background: "var(--gg-card, white)",
      borderRadius: 10,
      padding: "14px 18px",
      border: "1px solid var(--gg-border, #e5e7eb)",
      display: "grid",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Text Script</span>
        {status === "saving" && <span style={{ fontSize: 12, color: "#6b7280" }}>Saving…</span>}
        {status === "saved"  && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Saved ✓</span>}
        {status === "error"  && <span style={{ fontSize: 12, color: "#dc2626" }}>Error — retry</span>}
      </div>

      <textarea
        ref={textareaRef}
        value={script}
        onChange={e => setScript(e.target.value)}
        onBlur={e => save(e.target.value)}
        placeholder="Hi {First_Name}, we'd love your feedback: {Survey_Link}"
        rows={4}
        style={{
          width: "100%",
          padding: "9px 11px",
          borderRadius: 7,
          border: "1px solid var(--gg-border, #e5e7eb)",
          background: "var(--gg-input, white)",
          fontSize: 14,
          fontFamily: "inherit",
          lineHeight: 1.55,
          resize: "vertical",
          boxSizing: "border-box",
          color: "inherit",
        }}
      />

      {/* Merge tag chips */}
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)" }}>
          Insert merge tag
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {TAGS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => insertTag(t.value)}
              style={{
                padding: "3px 9px",
                borderRadius: 5,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: "rgba(37,99,235,0.07)",
                color: "var(--gg-primary, #2563eb)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              {t.value}
            </button>
          ))}
        </div>
      </div>

      {/* Survey link preview */}
      {surveySlug && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>Survey link preview: </span>
          /s/{surveySlug}?contact_id=&#123;person_id&#125;
        </p>
      )}
      {!surveySlug && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)", lineHeight: 1.5 }}>
          No survey assigned — <span style={{ fontStyle: "italic" }}>{"{Survey_Link}"}</span> will be blank until a survey is linked above.
        </p>
      )}
    </div>
  );
}
