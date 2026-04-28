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
  conditions?: {
    show_if: { question_id: string; operator: "equals" | "not_equals" | "contains"; value: string };
  } | null;
};

function isQuestionVisible(q: Question, answers: Map<string, string>): boolean {
  const c = q.conditions?.show_if;
  if (!c?.question_id) return true;
  const actual = String(answers.get(c.question_id) ?? "").toLowerCase();
  const target = String(c.value ?? "").toLowerCase();
  if (c.operator === "equals")     return actual === target;
  if (c.operator === "not_equals") return actual !== target;
  if (c.operator === "contains")   return actual.includes(target);
  return true;
}

type ViewConfig = {
  pagination: "one_at_a_time" | "all_at_once" | "pages";
  page_groups: string[][] | null;
};

// ── Shared style tokens ───────────────────────────────────────────────────────

const BTN_BASE: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
  transition: "border-color 0.12s, background 0.12s",
};

const BTN_UNSEL: React.CSSProperties = {
  ...BTN_BASE,
  border: "2px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
};

const BTN_SEL: React.CSSProperties = {
  ...BTN_BASE,
  border: "2px solid #3b82f6",
  background: "rgba(59,130,246,0.18)",
  color: "inherit",
};

const INPUT_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontSize: 15,
  boxSizing: "border-box",
  marginTop: 4,
};

// ── Main export ───────────────────────────────────────────────────────────────

export default function KnockSurvey({
  surveyId,
  contactId,
  viewType = "door",
  onDone,
}: {
  surveyId: string;
  contactId: string;
  viewType?: "door" | "call" | "text";
  onDone: (opportunityId?: string) => void;
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
      <div style={{ padding: "20px 0", textAlign: "center", opacity: 0.6, fontSize: 14 }}>
        Loading survey…
      </div>
    );
  }

  if (questions.length === 0) {
    onDone();
    return null;
  }

  // ── Question ordering ─────────────────────────────────────────────────────

  function getOrderedQuestions(): Question[] {
    let ordered: Question[];
    if (viewConfig.pagination !== "pages" || !viewConfig.page_groups) {
      ordered = questions;
    } else {
      const qMap = new Map(questions.map((q) => [q.id, q]));
      ordered = [];
      for (const group of viewConfig.page_groups) {
        for (const qId of group) {
          const q = qMap.get(qId);
          if (q) ordered.push(q);
        }
      }
      const seen = new Set(ordered.map((q) => q.id));
      for (const q of questions) {
        if (!seen.has(q.id)) ordered.push(q);
      }
    }
    return ordered.filter((q) => isQuestionVisible(q, answers));
  }

  function getPages(): Question[][] {
    if (!viewConfig.page_groups) return [questions.filter((q) => isQuestionVisible(q, answers))];
    const qMap = new Map(questions.map((q) => [q.id, q]));
    return viewConfig.page_groups
      .map((group) => group.map((qId) => qMap.get(qId)).filter((q): q is Question => q != null && isQuestionVisible(q, answers)))
      .filter((g) => g.length > 0);
  }

  const orderedQs = getOrderedQuestions();
  const pages = viewConfig.pagination === "pages" ? getPages() : null;

  // ── Answer helpers ────────────────────────────────────────────────────────

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

    const allAnswers: Record<string, string> = {};
    for (const q of questions) {
      if (["multiple_select", "multiple_select_with_other"].includes(q.question_type)) {
        const sels = multiSelections.get(q.id);
        if (sels?.size) allAnswers[q.id] = JSON.stringify([...sels]);
      } else if (["text", "text_short", "number", "email", "phone", "date"].includes(q.question_type)) {
        const v = textInputs.get(q.id);
        if (v) allAnswers[q.id] = v;
      } else {
        const v = answers.get(q.id);
        if (v) allAnswers[q.id] = v;
      }
    }

    let opportunityId: string | undefined;
    try {
      const res = await fetch("/api/survey/evaluate-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_id: surveyId, contact_id: contactId, answers: allAnswers }),
      });
      if (res.ok) {
        const data = await res.json();
        opportunityId = data.opportunity_id ?? undefined;
      }
    } catch { /* ignore */ }

    onDone(opportunityId);
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
        <ProgressBar progress={pageIdx / pages.length} label={`Page ${pageIdx + 1} of ${pages.length}`} onRefuse={onDone} />
        <div style={{ display: "grid", gap: 20, marginBottom: 24 }}>
          {currentPage.map((q) => (
            <QuestionRenderer key={q.id} q={q} answers={answers} textInputs={textInputs} multiSelections={multiSelections}
              setAnswers={setAnswers} setTextInputs={setTextInputs} setMultiSelections={setMultiSelections} />
          ))}
        </div>
        <NavRow
          onBack={pageIdx > 0 ? () => setPageIdx(pageIdx - 1) : undefined}
          onNext={submitPage}
          nextLabel={saving ? "Saving…" : isLastPage ? "Done ✓" : `Page ${pageIdx + 2} →`}
          nextDisabled={saving || currentPage.some((q) => q.required && !getAnswerValue(q))}
        />
      </SurveyCard>
    );
  }

  // ── "One at a time" mode (default) ───────────────────────────────────────
  const safeIdx = Math.min(qIdx, orderedQs.length - 1);
  const q = orderedQs[safeIdx];
  const isLast = safeIdx === orderedQs.length - 1;
  const currentVal = getAnswerValue(q);
  const canGoNext = q.required ? Boolean(currentVal) : true;

  async function goNext() {
    setSaving(true);
    if (currentVal) await saveAnswer(q.id, currentVal, textInputs.get(q.id));
    setSaving(false);
    if (isLast) {
      await completeSurvey();
    } else {
      setQIdx(safeIdx + 1);
    }
  }

  return (
    <SurveyCard>
      <ProgressBar progress={safeIdx / orderedQs.length} label={`Question ${safeIdx + 1} of ${orderedQs.length}`} onRefuse={onDone} />
      <QuestionRenderer q={q} answers={answers} textInputs={textInputs} multiSelections={multiSelections}
        setAnswers={setAnswers} setTextInputs={setTextInputs} setMultiSelections={setMultiSelections} />
      <NavRow
        onBack={safeIdx > 0 ? () => setQIdx(safeIdx - 1) : undefined}
        onNext={goNext}
        nextLabel={saving ? "Saving…" : isLast ? "Done ✓" : "Next →"}
        nextDisabled={!canGoNext || saving}
      />
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

  const visibleQs = questions.filter((q) => isQuestionVisible(q, answers));
  const allRequired = visibleQs.filter((q) => q.required);
  const allAnswered = allRequired.every((q) => {
    if (["multiple_select", "multiple_select_with_other"].includes(q.question_type))
      return (multiSelections.get(q.id)?.size ?? 0) > 0;
    if (["text", "text_short", "number", "email", "phone", "date"].includes(q.question_type))
      return Boolean(textInputs.get(q.id)?.trim());
    return Boolean(answers.get(q.id));
  });

  return (
    <SurveyCard>
      <ProgressBar progress={0} label={`${questions.length} question${questions.length !== 1 ? "s" : ""}`} onRefuse={onDone} />
      <div style={{ display: "grid", gap: 24, marginBottom: 24 }}>
        {visibleQs.map((q) => (
          <QuestionRenderer key={q.id} q={q} answers={answers} textInputs={textInputs} multiSelections={multiSelections}
            setAnswers={setAnswers} setTextInputs={setTextInputs} setMultiSelections={setMultiSelections} />
        ))}
      </div>
      <NavRow onNext={handleSubmit} nextLabel={saving ? "Saving…" : "Done ✓"} nextDisabled={saving || !allAnswered} />
    </SurveyCard>
  );
}

// ── Question renderer ─────────────────────────────────────────────────────────

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

  function setAnswer(val: string) { setAnswers(new Map(answers.set(q.id, val))); }
  function setText(val: string) { setTextInputs(new Map(textInputs.set(q.id, val))); }
  function toggleMulti(val: string) {
    const next = new Set(currentSelections);
    if (next.has(val)) next.delete(val); else next.add(val);
    setMultiSelections(new Map(multiSelections.set(q.id, next)));
  }

  return (
    <div>
      <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 14, lineHeight: 1.4, margin: "0 0 14px" }}>
        {q.question_text}
        {q.required && <span style={{ color: "#f87171", marginLeft: 4 }}>*</span>}
      </p>

      {/* Single-choice */}
      {["multiple_choice", "multiple_choice_with_other"].includes(q.question_type) && (
        <>
          {isDropdown ? (
            <select value={currentAnswer} onChange={(e) => setAnswer(e.target.value)} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
              <option value="">— Select —</option>
              {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              {q.question_type === "multiple_choice_with_other" && <option value="other">Other…</option>}
            </select>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {options.map((opt) => (
                <button key={opt} type="button" onClick={() => setAnswer(opt)}
                  style={currentAnswer === opt ? BTN_SEL : BTN_UNSEL}>
                  {opt}
                </button>
              ))}
              {q.question_type === "multiple_choice_with_other" && (
                <button type="button" onClick={() => setAnswer("other")}
                  style={currentAnswer === "other" ? BTN_SEL : BTN_UNSEL}>
                  Other
                </button>
              )}
            </div>
          )}
          {currentAnswer === "other" && (
            <input type="text" style={{ ...INPUT_STYLE, marginTop: 10 }} placeholder="Please specify…"
              value={currentText} onChange={(e) => setText(e.target.value)} autoFocus />
          )}
        </>
      )}

      {/* Multi-select */}
      {["multiple_select", "multiple_select_with_other"].includes(q.question_type) && (
        <>
          {isDropdown ? (
            <select multiple value={[...currentSelections]}
              onChange={(e) => setMultiSelections(new Map(multiSelections.set(q.id, new Set(Array.from(e.target.selectedOptions, (o) => o.value)))))}
              style={{ ...INPUT_STYLE, minHeight: 110 }}>
              {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              {q.question_type === "multiple_select_with_other" && <option value="other">Other…</option>}
            </select>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {options.map((opt) => (
                <button key={opt} type="button" onClick={() => toggleMulti(opt)}
                  style={currentSelections.has(opt) ? BTN_SEL : BTN_UNSEL}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: currentSelections.has(opt) ? "2px solid #3b82f6" : "2px solid rgba(255,255,255,0.3)",
                      background: currentSelections.has(opt) ? "#3b82f6" : "transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#fff",
                    }}>
                      {currentSelections.has(opt) && "✓"}
                    </span>
                    {opt}
                  </span>
                </button>
              ))}
              {q.question_type === "multiple_select_with_other" && (
                <button type="button" onClick={() => toggleMulti("other")}
                  style={currentSelections.has("other") ? BTN_SEL : BTN_UNSEL}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: currentSelections.has("other") ? "2px solid #3b82f6" : "2px solid rgba(255,255,255,0.3)",
                      background: currentSelections.has("other") ? "#3b82f6" : "transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#fff",
                    }}>
                      {currentSelections.has("other") && "✓"}
                    </span>
                    Other
                  </span>
                </button>
              )}
            </div>
          )}
          {currentSelections.has("other") && (
            <input type="text" style={{ ...INPUT_STYLE, marginTop: 10 }} placeholder="Please specify…"
              value={currentText} onChange={(e) => setText(e.target.value)} />
          )}
        </>
      )}

      {/* Yes / No */}
      {q.question_type === "yes_no" && (
        <div style={{ display: "flex", gap: 10 }}>
          {["Yes", "No"].map((opt) => (
            <button key={opt} type="button" onClick={() => setAnswer(opt)}
              style={{ ...BTN_BASE, flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700,
                border: currentAnswer === opt ? "2px solid #3b82f6" : "2px solid rgba(255,255,255,0.15)",
                background: currentAnswer === opt ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                color: "inherit" }}>
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Rating */}
      {q.question_type === "rating" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: parseInt(options[0] ?? "5") }, (_, i) => i + 1).map((n) => {
            const val = String(n);
            const sel = currentAnswer === val;
            return (
              <button key={n} type="button" onClick={() => setAnswer(val)}
                style={{ width: 48, height: 48, borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
                  border: sel ? "2px solid #3b82f6" : "2px solid rgba(255,255,255,0.15)",
                  background: sel ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                  color: "inherit", transition: "border-color 0.12s, background 0.12s" }}>
                {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Text inputs */}
      {q.question_type === "text" && (
        <textarea rows={3} style={{ ...INPUT_STYLE, resize: "vertical" }} placeholder="Your answer…"
          value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "text_short" && (
        <input type="text" style={INPUT_STYLE} placeholder="Your answer…" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "number" && (
        <input type="number" style={INPUT_STYLE} placeholder="0" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "email" && (
        <input type="email" style={INPUT_STYLE} placeholder="email@example.com" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "phone" && (
        <input type="tel" style={INPUT_STYLE} placeholder="(555) 555-5555" value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
      {q.question_type === "date" && (
        <input type="date" style={INPUT_STYLE} value={currentText} onChange={(e) => setText(e.target.value)} />
      )}
    </div>
  );
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function SurveyCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20,
      padding: "20px 18px 24px",
      marginTop: 16,
    }}>
      {children}
    </div>
  );
}

function ProgressBar({ progress, label, onRefuse }: { progress: number; label: string; onRefuse: () => void }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "#3b82f6", borderRadius: 4, transition: "width 0.3s ease" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.5, letterSpacing: "0.03em" }}>{label}</span>
        <button type="button" onClick={onRefuse} style={{
          background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8,
          padding: "5px 14px", fontSize: 13, fontWeight: 500, color: "inherit", opacity: 0.65, cursor: "pointer",
        }}>
          Skip
        </button>
      </div>
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel, nextDisabled }: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
      {onBack ? (
        <button type="button" onClick={onBack} style={{
          padding: "12px 18px", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "inherit",
        }}>
          ← Back
        </button>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <button type="button" onClick={onNext} disabled={nextDisabled} style={{
        flex: 1, padding: "13px 20px", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: nextDisabled ? "default" : "pointer",
        border: "none",
        background: nextDisabled ? "rgba(255,255,255,0.1)" : "#2563eb",
        color: nextDisabled ? "rgba(255,255,255,0.35)" : "#fff",
        transition: "background 0.15s",
      }}>
        {nextLabel}
      </button>
    </div>
  );
}
