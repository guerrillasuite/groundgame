"use client";

import React, { useEffect, useState } from "react";

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  display_format: string | null;
  required: boolean;
  order_index: number;
};

type ViewConfig = {
  pagination: "one_at_a_time" | "all_at_once" | "pages";
  page_groups: string[][] | null;
};

export default function KnockSurvey({
  surveyId,
  contactId,
  viewType = "door",
  onDone,
}: {
  surveyId: string;
  contactId: string;
  viewType?: "door" | "call" | "text";
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [viewConfig, setViewConfig] = useState<ViewConfig>({ pagination: "one_at_a_time", page_groups: null });
  const [qIdx, setQIdx] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [textInputs, setTextInputs] = useState<Map<string, string>>(new Map());
  const [multiSelections, setMultiSelections] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/survey/${surveyId}`).then((r) => r.json()),
      fetch(`/api/survey/${surveyId}/view-configs`).then((r) => r.json()),
    ])
      .then(([surveyData, cfgData]) => {
        setQuestions(surveyData.questions ?? []);
        const configs: ViewConfig[] = cfgData.configs ?? [];
        const match = configs.find((c: any) => c.view_type === viewType);
        if (match) setViewConfig({ pagination: match.pagination, page_groups: match.page_groups ?? null });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [surveyId, viewType]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed p-4 mt-4 text-center opacity-60 text-sm">
        Loading survey…
      </div>
    );
  }

  if (questions.length === 0) {
    onDone();
    return null;
  }

  // ── Determine question sequence based on view config ──────────────────────
  // Build ordered question list for this view
  function getOrderedQuestions(): Question[] {
    if (viewConfig.pagination !== "pages" || !viewConfig.page_groups) return questions;
    // Flatten page_groups in order, filtering to valid question IDs
    const qMap = new Map(questions.map((q) => [q.id, q]));
    const ordered: Question[] = [];
    for (const group of viewConfig.page_groups) {
      for (const qId of group) {
        const q = qMap.get(qId);
        if (q) ordered.push(q);
      }
    }
    // Append any questions not in page_groups (safety net)
    const seen = new Set(ordered.map((q) => q.id));
    for (const q of questions) {
      if (!seen.has(q.id)) ordered.push(q);
    }
    return ordered;
  }

  // For "pages" mode: get the questions on each page
  function getPages(): Question[][] {
    if (!viewConfig.page_groups) return [questions];
    const qMap = new Map(questions.map((q) => [q.id, q]));
    return viewConfig.page_groups.map((group) =>
      group.map((qId) => qMap.get(qId)).filter(Boolean) as Question[]
    ).filter((g) => g.length > 0);
  }

  const orderedQs = getOrderedQuestions();
  const pages = viewConfig.pagination === "pages" ? getPages() : null;

  // ── Save helpers ──────────────────────────────────────────────────────────
  async function saveAnswer(questionId: string, value: string, text?: string) {
    await fetch("/api/survey/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crm_contact_id: contactId,
        survey_id: surveyId,
        question_id: questionId,
        answer_value: value,
        answer_text: text ?? null,
      }),
    }).catch(() => {});
  }

  async function completeSurvey() {
    await fetch("/api/survey/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crm_contact_id: contactId, survey_id: surveyId }),
    }).catch(() => {});
    onDone();
  }

  // ── "All at once" mode ────────────────────────────────────────────────────
  if (viewConfig.pagination === "all_at_once") {
    return (
      <AllAtOnce
        surveyId={surveyId}
        questions={orderedQs}
        contactId={contactId}
        onDone={onDone}
        answers={answers}
        setAnswers={setAnswers}
        textInputs={textInputs}
        setTextInputs={setTextInputs}
        multiSelections={multiSelections}
        setMultiSelections={setMultiSelections}
        saveAnswer={saveAnswer}
        completeSurvey={completeSurvey}
      />
    );
  }

  // ── "Pages" mode ──────────────────────────────────────────────────────────
  if (viewConfig.pagination === "pages" && pages) {
    const currentPage = pages[pageIdx] ?? [];
    const isLastPage = pageIdx === pages.length - 1;

    async function submitPage() {
      setSaving(true);
      for (const q of currentPage) {
        const val = getAnswerValue(q);
        if (val) await saveAnswer(q.id, val, textInputs.get(q.id));
      }
      setSaving(false);
      if (isLastPage) {
        await completeSurvey();
      } else {
        setPageIdx(pageIdx + 1);
      }
    }

    return (
      <SurveyCard>
        <SurveyTopBar
          label={`Page ${pageIdx + 1} of ${pages.length}`}
          progress={(pageIdx) / pages.length}
          onRefuse={onDone}
        />
        <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
          {currentPage.map((q) => (
            <QuestionRenderer
              key={q.id}
              q={q}
              answers={answers}
              textInputs={textInputs}
              multiSelections={multiSelections}
              setAnswers={setAnswers}
              setTextInputs={setTextInputs}
              setMultiSelections={setMultiSelections}
            />
          ))}
        </div>
        <div className="actions">
          <button
            type="button"
            className="press-card plain action-skip"
            disabled={pageIdx === 0}
            onClick={() => setPageIdx(pageIdx - 1)}
          >
            ← Back
          </button>
          <button
            type="button"
            className="btn action-submit"
            disabled={saving || currentPage.some((q) => q.required && !getAnswerValue(q))}
            onClick={submitPage}
          >
            {saving ? "Saving…" : isLastPage ? "Done ✓" : `Page ${pageIdx + 2} →`}
          </button>
        </div>
      </SurveyCard>
    );
  }

  // ── "One at a time" mode (default) ────────────────────────────────────────
  const q = orderedQs[qIdx];
  const isLast = qIdx === orderedQs.length - 1;

  function getAnswerValue(question: Question): string {
    if (["multiple_select", "multiple_select_with_other"].includes(question.question_type)) {
      const sels = multiSelections.get(question.id);
      return sels ? JSON.stringify([...sels]) : "";
    }
    if (["text", "text_short", "number", "email", "phone", "date"].includes(question.question_type)) {
      return textInputs.get(question.id) ?? "";
    }
    return answers.get(question.id) ?? "";
  }

  const currentVal = getAnswerValue(q);
  const canGoNext = q.required ? Boolean(currentVal) : true;

  async function goNext() {
    setSaving(true);
    await saveAnswer(q.id, currentVal, textInputs.get(q.id));
    setSaving(false);
    if (isLast) {
      await completeSurvey();
    } else {
      setQIdx(qIdx + 1);
    }
  }

  return (
    <SurveyCard>
      <SurveyTopBar
        label={`Q ${qIdx + 1} of ${orderedQs.length}`}
        progress={qIdx / orderedQs.length}
        onRefuse={onDone}
      />
      <QuestionRenderer
        q={q}
        answers={answers}
        textInputs={textInputs}
        multiSelections={multiSelections}
        setAnswers={setAnswers}
        setTextInputs={setTextInputs}
        setMultiSelections={setMultiSelections}
      />
      <div className="actions" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="press-card plain action-skip"
          onClick={() => { if (qIdx > 0) setQIdx(qIdx - 1); }}
          disabled={qIdx === 0}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn action-submit"
          onClick={goNext}
          disabled={!canGoNext || saving}
        >
          {saving ? "Saving…" : isLast ? "Done ✓" : "Next →"}
        </button>
      </div>
    </SurveyCard>
  );
}

// ── All-at-once renderer ──────────────────────────────────────────────────────

function AllAtOnce({
  questions, onDone,
  answers, setAnswers, textInputs, setTextInputs,
  multiSelections, setMultiSelections, saveAnswer, completeSurvey,
}: {
  questions: Question[]; contactId: string; surveyId: string; onDone: () => void;
  answers: Map<string, string>; setAnswers: (m: Map<string, string>) => void;
  textInputs: Map<string, string>; setTextInputs: (m: Map<string, string>) => void;
  multiSelections: Map<string, Set<string>>; setMultiSelections: (m: Map<string, Set<string>>) => void;
  saveAnswer: (qId: string, value: string, text?: string) => Promise<void>;
  completeSurvey: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    for (const q of questions) {
      let val = "";
      if (["multiple_select", "multiple_select_with_other"].includes(q.question_type)) {
        const sels = multiSelections.get(q.id);
        val = sels ? JSON.stringify([...sels]) : "";
      } else if (["text", "text_short", "number", "email", "phone", "date"].includes(q.question_type)) {
        val = textInputs.get(q.id) ?? "";
      } else {
        val = answers.get(q.id) ?? "";
      }
      if (val) await saveAnswer(q.id, val, textInputs.get(q.id));
    }
    setSaving(false);
    await completeSurvey();
  }

  const allRequired = questions.filter((q) => q.required);
  const allAnswered = allRequired.every((q) => {
    if (["multiple_select", "multiple_select_with_other"].includes(q.question_type)) {
      return (multiSelections.get(q.id)?.size ?? 0) > 0;
    }
    if (["text", "text_short", "number", "email", "phone", "date"].includes(q.question_type)) {
      return Boolean(textInputs.get(q.id)?.trim());
    }
    return Boolean(answers.get(q.id));
  });

  return (
    <SurveyCard>
      <SurveyTopBar
        label={`Survey — ${questions.length} question${questions.length !== 1 ? "s" : ""}`}
        progress={0}
        onRefuse={onDone}
      />
      <div style={{ display: "grid", gap: 16 }}>
        {questions.map((q) => (
          <QuestionRenderer
            key={q.id}
            q={q}
            answers={answers}
            textInputs={textInputs}
            multiSelections={multiSelections}
            setAnswers={setAnswers}
            setTextInputs={setTextInputs}
            setMultiSelections={setMultiSelections}
          />
        ))}
      </div>
      <div className="actions" style={{ marginTop: 20 }}>
        <div />
        <button
          type="button"
          className="btn action-submit"
          disabled={saving || !allAnswered}
          onClick={handleSubmit}
        >
          {saving ? "Saving…" : "Done ✓"}
        </button>
      </div>
    </SurveyCard>
  );
}

// ── Individual question renderer ──────────────────────────────────────────────

function QuestionRenderer({
  q, answers, textInputs, multiSelections,
  setAnswers, setTextInputs, setMultiSelections,
}: {
  q: Question;
  answers: Map<string, string>;
  textInputs: Map<string, string>;
  multiSelections: Map<string, Set<string>>;
  setAnswers: (m: Map<string, string>) => void;
  setTextInputs: (m: Map<string, string>) => void;
  setMultiSelections: (m: Map<string, Set<string>>) => void;
}) {
  const options = q.options ?? [];
  const currentAnswer = answers.get(q.id) ?? "";
  const currentText = textInputs.get(q.id) ?? "";
  const currentSelections = multiSelections.get(q.id) ?? new Set<string>();
  const isDropdown = q.display_format === "dropdown";

  function setAnswer(val: string) {
    setAnswers(new Map(answers.set(q.id, val)));
  }
  function setText(val: string) {
    setTextInputs(new Map(textInputs.set(q.id, val)));
  }
  function toggleMulti(val: string) {
    const next = new Set(currentSelections);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setMultiSelections(new Map(multiSelections.set(q.id, next)));
  }

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm mt-1";

  return (
    <div>
      <p className="text-sm font-medium mb-2">
        {q.question_text}
        {q.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </p>

      {/* Single-choice: option buttons or dropdown */}
      {["multiple_choice", "multiple_choice_with_other"].includes(q.question_type) && (
        <>
          {isDropdown ? (
            <select
              value={currentAnswer}
              onChange={(e) => setAnswer(e.target.value)}
              className={inputCls}
              style={{ cursor: "pointer" }}
            >
              <option value="">— Select —</option>
              {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              {q.question_type === "multiple_choice_with_other" && <option value="other">Other…</option>}
            </select>
          ) : (
            <div className="dispo-grid">
              {options.map((opt) => (
                <button
                  key={opt} type="button"
                  className="press-card plain"
                  data-selected={currentAnswer === opt}
                  aria-pressed={currentAnswer === opt}
                  onClick={() => setAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
              {q.question_type === "multiple_choice_with_other" && (
                <button
                  type="button" className="press-card plain"
                  data-selected={currentAnswer === "other"}
                  aria-pressed={currentAnswer === "other"}
                  onClick={() => setAnswer("other")}
                >
                  Other
                </button>
              )}
            </div>
          )}
          {currentAnswer === "other" && (
            <input
              type="text" className={inputCls + " mt-2"}
              placeholder="Please specify…"
              value={currentText}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          )}
        </>
      )}

      {/* Multi-select: checkboxes or multi dropdown */}
      {["multiple_select", "multiple_select_with_other"].includes(q.question_type) && (
        <>
          {isDropdown ? (
            <select
              multiple
              value={[...currentSelections]}
              onChange={(e) => {
                const vals = new Set(Array.from(e.target.selectedOptions, (o) => o.value));
                setMultiSelections(new Map(multiSelections.set(q.id, vals)));
              }}
              className={inputCls}
              style={{ minHeight: 100 }}
            >
              {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              {q.question_type === "multiple_select_with_other" && <option value="other">Other…</option>}
            </select>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {options.map((opt) => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={currentSelections.has(opt)}
                    onChange={() => toggleMulti(opt)}
                    style={{ width: 16, height: 16 }}
                  />
                  {opt}
                </label>
              ))}
              {q.question_type === "multiple_select_with_other" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={currentSelections.has("other")}
                    onChange={() => toggleMulti("other")}
                    style={{ width: 16, height: 16 }}
                  />
                  Other
                </label>
              )}
            </div>
          )}
          {currentSelections.has("other") && (
            <input
              type="text" className={inputCls + " mt-2"}
              placeholder="Please specify…"
              value={currentText}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </>
      )}

      {/* Yes/No */}
      {q.question_type === "yes_no" && (
        <div className="dispo-grid">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt} type="button" className="press-card plain"
              data-selected={currentAnswer === opt}
              aria-pressed={currentAnswer === opt}
              onClick={() => setAnswer(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Rating scale */}
      {q.question_type === "rating" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Array.from({ length: parseInt(options[0] ?? "5") }, (_, i) => i + 1).map((n) => {
            const val = String(n);
            return (
              <button
                key={n} type="button" className="press-card plain"
                data-selected={currentAnswer === val}
                aria-pressed={currentAnswer === val}
                onClick={() => setAnswer(val)}
                style={{ minWidth: 40, fontWeight: 600 }}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Text inputs */}
      {q.question_type === "text" && (
        <textarea rows={3} className={inputCls} placeholder="Your answer…" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "text_short" && (
        <input type="text" className={inputCls} placeholder="Your answer…" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "number" && (
        <input type="number" className={inputCls} placeholder="0" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "email" && (
        <input type="email" className={inputCls} placeholder="email@example.com" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "phone" && (
        <input type="tel" className={inputCls} placeholder="(555) 555-5555" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "date" && (
        <input type="date" className={inputCls} value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
    </div>
  );
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function SurveyCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface, rgba(255,255,255,0.06))",
      border: "1px solid var(--border, rgba(255,255,255,0.1))",
      borderRadius: 20,
      padding: "16px 16px 20px",
      marginTop: 12,
    }}>
      {children}
    </div>
  );
}

function SurveyTopBar({
  label,
  progress,
  onRefuse,
}: {
  label: string;
  progress: number;
  onRefuse: () => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "var(--primary, #2563eb)", borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.55, letterSpacing: "0.03em" }}>{label}</span>
        <button
          type="button"
          onClick={onRefuse}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 10,
            padding: "6px 16px",
            fontSize: 13,
            fontWeight: 500,
            color: "inherit",
            opacity: 0.7,
            cursor: "pointer",
          }}
        >
          Refuse Survey
        </button>
      </div>
    </div>
  );
}
