"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  GripVertical,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionType =
  | "multiple_choice"
  | "multiple_choice_with_other"
  | "multiple_select_with_other"
  | "text"
  | "yes_no"
  | "date";

type LocalQuestion = {
  id: string;          // "tmp-xxx" for unsaved, real DB id once saved
  question_text: string;
  question_type: QuestionType;
  options: string[];
  required: boolean;
  order_index: number;
  isNew: boolean;      // not yet in DB
};

const QUESTION_TYPES: { value: QuestionType; label: string; hasOptions: boolean }[] = [
  { value: "multiple_choice", label: "Multiple Choice", hasOptions: true },
  { value: "multiple_choice_with_other", label: "Multiple Choice + Other", hasOptions: true },
  { value: "multiple_select_with_other", label: "Multi-Select", hasOptions: true },
  { value: "text", label: "Text / Comment", hasOptions: false },
  { value: "yes_no", label: "Yes / No", hasOptions: false },
  { value: "date", label: "Date", hasOptions: false },
];

function newTmpId() {
  return "tmp-" + Math.random().toString(36).slice(2, 10);
}

function blankQuestion(order_index: number): LocalQuestion {
  return {
    id: newTmpId(),
    question_text: "",
    question_type: "multiple_choice",
    options: ["", ""],
    required: true,
    order_index,
    isNew: true,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SurveyBuilder({ surveyId }: { surveyId?: string }) {
  const router = useRouter();
  const isNew = !surveyId;

  // Survey meta
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [active, setActive] = useState(true);
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);

  // Questions
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]); // real IDs to DELETE on save

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load existing survey ──────────────────────────────────────────────────
  useEffect(() => {
    if (!surveyId) return;
    fetch(`/api/survey/${surveyId}?edit=1`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setTitle(data.survey.title ?? "");
        setDescription(data.survey.description ?? "");
        setWebsiteUrl(data.survey.website_url ?? "");
        setFooterText(data.survey.footer_text ?? "");
        setActive(Boolean(data.survey.active));
        const qs: LocalQuestion[] = (data.questions ?? []).map((q: any) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type as QuestionType,
          options: q.options ?? [],
          required: Boolean(q.required),
          order_index: q.order_index,
          isNew: false,
        }));
        setQuestions(qs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [surveyId]);

  // ── Question helpers ──────────────────────────────────────────────────────
  function addQuestion() {
    const q = blankQuestion(questions.length + 1);
    setQuestions((prev) => [...prev, q]);
    setExpandedId(q.id);
  }

  function updateQuestion(id: string, patch: Partial<LocalQuestion>) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (!id.startsWith("tmp-")) {
      setDeletedIds((prev) => [...prev, id]);
    }
    if (expandedId === id) setExpandedId(null);
  }

  function moveQuestion(id: string, dir: -1 | 1) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((q, i) => ({ ...q, order_index: i + 1 }));
    });
  }

  function setOptionText(qId: string, optIdx: number, val: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        opts[optIdx] = val;
        return { ...q, options: opts };
      })
    );
  }

  function addOption(qId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId ? { ...q, options: [...q.options, ""] } : q
      )
    );
  }

  function removeOption(qId: string, optIdx: number) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const opts = q.options.filter((_, i) => i !== optIdx);
        return { ...q, options: opts };
      })
    );
  }

  function handleTypeChange(qId: string, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const typeInfo = QUESTION_TYPES.find((t) => t.value === type)!;
        let options = q.options;
        if (type === "yes_no") options = ["Yes", "No"];
        else if (!typeInfo.hasOptions) options = [];
        else if (options.length === 0) options = ["", ""];
        return { ...q, question_type: type, options };
      })
    );
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) {
      alert("Please enter a survey title.");
      return;
    }
    setSaving(true);
    setSaveStatus("idle");

    try {
      let sid = surveyId;

      // 1. Create survey if new
      if (isNew) {
        const res = await fetch("/api/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, id: slug.trim() || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create survey");
        sid = data.survey_id;
      } else {
        // 2. Update existing meta
        const res = await fetch(`/api/survey/${sid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, website_url: websiteUrl || null, footer_text: footerText || null, active }),
        });
        if (!res.ok) throw new Error("Failed to update survey");
      }

      // 3. Delete removed questions
      for (const delId of deletedIds) {
        await fetch(`/api/survey/${sid}/questions/${delId}`, { method: "DELETE" });
      }
      setDeletedIds([]);

      // 4. Save questions
      const savedQuestions: LocalQuestion[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = { ...questions[i], order_index: i + 1 };
        const body = {
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options.filter((o) => o.trim()),
          required: q.required,
          order_index: q.order_index,
        };

        if (q.isNew) {
          const res = await fetch(`/api/survey/${sid}/questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to create question");
          savedQuestions.push({ ...q, id: data.question_id, isNew: false });
        } else {
          await fetch(`/api/survey/${sid}/questions/${q.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          savedQuestions.push({ ...q, isNew: false });
        }
      }
      setQuestions(savedQuestions);

      setSaveStatus("saved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 2500);

      // Navigate to edit page if this was a new survey
      if (isNew && sid) {
        router.replace(`/crm/survey/${sid}/edit`);
      }
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete survey ─────────────────────────────────────────────────────────
  async function handleDeleteSurvey() {
    if (!surveyId) return;
    if (!confirm(`Delete "${title}"? This will remove all responses and cannot be undone.`)) return;
    await fetch(`/api/survey/${surveyId}`, { method: "DELETE" });
    router.push("/crm/survey");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="stack">
        <div style={{ padding: 48, textAlign: "center", opacity: 0.5 }}>
          Loading survey…
        </div>
      </section>
    );
  }

  return (
    <section className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a
          href="/crm/survey"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 14,
            opacity: 0.6,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> Surveys
        </a>
        <div style={{ flex: 1 }} />
        {surveyId && (
          <a
            href={`/survey/${surveyId}?contact_id=PREVIEW`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.05)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Preview <ExternalLink size={13} />
          </a>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            background:
              saveStatus === "saved"
                ? "#22c55e"
                : saveStatus === "error"
                ? "#ef4444"
                : "var(--gg-primary, #2563eb)",
            color: "white",
            fontWeight: 700,
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 14,
          }}
        >
          {saving ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error — retry" : "Save Survey"}
        </button>
      </div>

      {/* ── Survey meta ── */}
      <div
        style={{
          background: "var(--gg-card, white)",
          borderRadius: 12,
          border: "1px solid var(--gg-border, #e5e7eb)",
          padding: 24,
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
            Survey Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugManual) {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
              }
            }}
            placeholder="e.g. Voter Issues Survey 2026"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
            {isNew ? "URL Slug" : "Survey ID"}
          </label>
          {isNew ? (
            <div>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder="e.g. wspq-event-june"
                style={inputStyle}
              />
              <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.5 }}>
                Public URL will be <code>/s/{slug || "your-slug"}</code>
              </p>
            </div>
          ) : (
            <div style={{ ...inputStyle, background: "rgba(0,0,0,0.04)", color: "inherit", opacity: 0.7, cursor: "default" }}>
              {surveyId}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description for canvassers"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
            "Learn More" URL (optional)
          </label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
            Footer text (optional — e.g. "Paid for by…")
          </label>
          <input
            type="text"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="Paid for by…"
            style={inputStyle}
          />
        </div>
        {!isNew && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              Active (visible to field apps)
            </label>
          </div>
        )}
      </div>

      {/* ── Questions ── */}
      <div style={{ display: "grid", gap: 12 }}>
        {questions.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              borderRadius: 12,
              border: "2px dashed var(--gg-border, #e5e7eb)",
              opacity: 0.5,
              fontSize: 14,
            }}
          >
            No questions yet — click "Add Question" below
          </div>
        )}

        {questions.map((q, idx) => {
          const expanded = expandedId === q.id;
          const typeInfo = QUESTION_TYPES.find((t) => t.value === q.question_type)!;

          return (
            <div
              key={q.id}
              style={{
                background: "var(--gg-card, white)",
                borderRadius: 12,
                border: `1px solid ${expanded ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}
            >
              {/* Question header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => setExpandedId(expanded ? null : q.id)}
              >
                <GripVertical size={14} style={{ opacity: 0.3, flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: 0.4,
                    flexShrink: 0,
                    minWidth: 24,
                  }}
                >
                  Q{idx + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    opacity: q.question_text ? 1 : 0.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q.question_text || "Untitled question"}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(0,0,0,0.06)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {typeInfo.label}
                </span>
                <div
                  style={{ display: "flex", gap: 2, flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconBtn
                    title="Move up"
                    disabled={idx === 0}
                    onClick={() => moveQuestion(q.id, -1)}
                  >
                    <ChevronUp size={14} />
                  </IconBtn>
                  <IconBtn
                    title="Move down"
                    disabled={idx === questions.length - 1}
                    onClick={() => moveQuestion(q.id, 1)}
                  >
                    <ChevronDown size={14} />
                  </IconBtn>
                  <IconBtn
                    title="Delete question"
                    onClick={() => {
                      if (confirm("Remove this question?")) removeQuestion(q.id);
                    }}
                    danger
                  >
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>

              {/* Expanded editor */}
              {expanded && (
                <div
                  style={{
                    padding: "0 16px 20px",
                    borderTop: "1px solid var(--gg-border, #e5e7eb)",
                    display: "grid",
                    gap: 14,
                  }}
                >
                  {/* Question text */}
                  <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
                    <label style={labelStyle}>Question text *</label>
                    <textarea
                      rows={2}
                      value={q.question_text}
                      onChange={(e) =>
                        updateQuestion(q.id, { question_text: e.target.value })
                      }
                      placeholder="Type your question here…"
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Type + Required row */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 180 }}>
                      <label style={labelStyle}>Question type</label>
                      <select
                        value={q.question_type}
                        onChange={(e) =>
                          handleTypeChange(q.id, e.target.value as QuestionType)
                        }
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 14,
                        cursor: "pointer",
                        paddingTop: 20,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) =>
                          updateQuestion(q.id, { required: e.target.checked })
                        }
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                      Required
                    </label>
                  </div>

                  {/* Options editor */}
                  {typeInfo.hasOptions && q.question_type !== "yes_no" && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={labelStyle}>Answer choices</label>
                      {q.options.map((opt, oi) => (
                        <div key={oi} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 12, opacity: 0.4, minWidth: 14 }}>
                            {oi + 1}.
                          </span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => setOptionText(q.id, oi, e.target.value)}
                            placeholder={`Choice ${oi + 1}`}
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          {q.options.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeOption(q.id, oi)}
                              style={{
                                border: "none",
                                background: "none",
                                cursor: "pointer",
                                padding: 4,
                                opacity: 0.4,
                                lineHeight: 1,
                              }}
                              title="Remove choice"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(q.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 13,
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: "rgba(0,0,0,0.04)",
                          border: "none",
                          cursor: "pointer",
                          width: "fit-content",
                          fontWeight: 500,
                        }}
                      >
                        <Plus size={13} /> Add choice
                      </button>
                    </div>
                  )}

                  {/* Yes/No preview */}
                  {q.question_type === "yes_no" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {["Yes", "No"].map((opt) => (
                        <span
                          key={opt}
                          style={{
                            padding: "6px 18px",
                            borderRadius: 20,
                            border: "1px solid var(--gg-border, #e5e7eb)",
                            fontSize: 13,
                            opacity: 0.6,
                          }}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add question ── */}
      <button
        type="button"
        onClick={addQuestion}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "14px",
          borderRadius: 12,
          border: "2px dashed var(--gg-border, #e5e7eb)",
          background: "transparent",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          width: "100%",
          opacity: 0.7,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
      >
        <Plus size={16} /> Add Question
      </button>

      {/* ── Danger zone ── */}
      {surveyId && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 24,
            borderTop: "1px solid var(--gg-border, #e5e7eb)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={handleDeleteSurvey}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #fca5a5",
              background: "transparent",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Trash2 size={14} /> Delete Survey
          </button>
        </div>
      )}
    </section>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)",
  fontSize: 14,
  background: "transparent",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

// ── Small icon button ─────────────────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "none",
        background: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "4px 5px",
        borderRadius: 4,
        lineHeight: 1,
        opacity: disabled ? 0.25 : 0.55,
        color: danger ? "#dc2626" : "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
