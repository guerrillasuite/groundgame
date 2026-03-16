"use client";

import { useEffect, useState } from "react";

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  required: boolean;
  order_index: number;
};

export default function KnockSurvey({
  surveyId,
  contactId,
  onDone,
}: {
  surveyId: string;
  contactId: string;
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [otherText, setOtherText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/survey/${surveyId}`)
      .then((r) => r.json())
      .then((d) => {
        setQuestions(d.questions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [surveyId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed p-4 mt-4 text-center opacity-60 text-sm">
        Loading survey…
      </div>
    );
  }

  if (questions.length === 0) {
    // No questions — treat as done immediately
    onDone();
    return null;
  }

  const q = questions[qIdx];
  const currentAnswer = answers.get(q.id) ?? "";
  const isLast = qIdx === questions.length - 1;
  const hasOther = q.question_type === "multiple_choice_with_other";

  async function saveAnswer(questionId: string, value: string) {
    await fetch("/api/survey/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crm_contact_id: contactId,
        survey_id: surveyId,
        question_id: questionId,
        answer_value: value,
        answer_text: value === "other" ? otherText : null,
      }),
    }).catch(() => {});
  }

  async function selectOption(value: string) {
    setAnswers(new Map(answers.set(q.id, value)));
    if (value !== "other") setOtherText("");
  }

  async function goNext() {
    if (!currentAnswer) return;
    setSaving(true);
    await saveAnswer(q.id, currentAnswer);
    setSaving(false);

    if (isLast) {
      await fetch("/api/survey/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crm_contact_id: contactId, survey_id: surveyId }),
      }).catch(() => {});
      onDone();
    } else {
      setQIdx(qIdx + 1);
      setOtherText("");
    }
  }

  const options = q.options ?? [];

  return (
    <div className="mt-4 rounded-2xl border border-dashed p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs opacity-60">
          Survey — Q {qIdx + 1} of {questions.length}
        </span>
        <button
          type="button"
          className="text-xs opacity-50 hover:opacity-80 underline"
          onClick={onDone}
        >
          Refuse Survey
        </button>
      </div>

      <p className="text-sm font-medium mb-3">{q.question_text}</p>

      <div className="dispo-grid">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className="press-card plain"
            data-selected={currentAnswer === opt}
            aria-pressed={currentAnswer === opt}
            onClick={() => selectOption(opt)}
          >
            {opt}
          </button>
        ))}
        {hasOther && (
          <button
            type="button"
            className="press-card plain"
            data-selected={currentAnswer === "other"}
            aria-pressed={currentAnswer === "other"}
            onClick={() => selectOption("other")}
          >
            Other
          </button>
        )}
      </div>

      {hasOther && currentAnswer === "other" && (
        <input
          type="text"
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          placeholder="Please specify…"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          autoFocus
        />
      )}

      <div className="actions mt-4">
        <button
          type="button"
          className="press-card plain action-skip"
          onClick={() => { if (qIdx > 0) { setQIdx(qIdx - 1); setOtherText(""); } }}
          disabled={qIdx === 0}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn action-submit"
          onClick={goNext}
          disabled={!currentAnswer || (currentAnswer === "other" && !otherText.trim()) || saving}
        >
          {saving ? "Saving…" : isLast ? "Done ✓" : "Next →"}
        </button>
      </div>
    </div>
  );
}
