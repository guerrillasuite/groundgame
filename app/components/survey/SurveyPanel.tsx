"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "quiz" | "results" | "post_submit" | "thankyou";
type QuizResult = "libertarian" | "progressive" | "conservative" | "authoritarian" | "moderate";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  order_index: number;
  options: string[] | null;
  display_format: string | null;
}

interface Branding {
  primaryColor?: string;
  bgColor?: string;
  textColor?: string;
  logoUrl?: string;
}

interface SurveyPanelProps {
  surveyId: string;
  tenantId: string;
  title: string;
  websiteUrl: string | null;
  footerText: string | null;
  questions: Question[];
  postSubmitSurveyId?: string | null;
  postSubmitQuestions?: Question[] | null;
  isKiosk: boolean;
  branding?: Branding;
}

// ── WSPQ scoring ───────────────────────────────────────────────────────────────

const WSPQ_SCORE: Record<string, number> = { agree: 20, maybe: 10, disagree: 0 };

function computeScores(questions: Question[], answers: Record<string, string>) {
  let personal = 0, economic = 0;
  for (const q of questions) {
    const pts = WSPQ_SCORE[answers[q.id]] ?? 0;
    if (q.order_index <= 5) personal += pts;
    else economic += pts;
  }
  return { personal, economic };
}

function computeResult(personal: number, economic: number): QuizResult {
  // Zone boundaries derived from SVG geometry (ri = r*0.35, inner corners at E+P=135/65, E-P=±35)
  const sum = economic + personal;
  const diff = economic - personal;
  if (sum >= 135) return "libertarian";
  if (sum <= 65) return "authoritarian";
  if (diff <= -35) return "progressive";
  if (diff >= 35) return "conservative";
  return "moderate";
}

// ── Result metadata ────────────────────────────────────────────────────────────

const RESULT_META: Record<QuizResult, { label: string; color: string; description: string }> = {
  libertarian: {
    label: "Libertarian",
    color: "#eab308",
    description:
      "You believe in personal AND economic freedom — get government out of the bedroom and out of the boardroom. You want people free to make their own choices as long as they don't harm others.",
  },
  progressive: {
    label: "Progressive",
    color: "#3b82f6",
    description:
      "You champion personal freedom and civil liberties while favoring some government role in managing the economy and addressing inequality.",
  },
  conservative: {
    label: "Conservative",
    color: "#ef4444",
    description:
      "You favor free markets, fiscal restraint, and limited economic regulation, while valuing traditional social structures and order.",
  },
  authoritarian: {
    label: "Authoritarian",
    color: "#475569",
    description:
      "You support an active government role in both personal and economic affairs, believing that strong oversight leads to a more stable and orderly society.",
  },
  moderate: {
    label: "Moderate",
    color: "#8b5cf6",
    description:
      "You see merit on multiple sides of the political spectrum, balancing individual freedom with social responsibility depending on the issue.",
  },
};

// ── Nolan Chart (diamond) ─────────────────────────────────────────────────────

function NolanChart({
  personalScore,
  economicScore,
  result,
}: {
  personalScore: number;
  economicScore: number;
  result: QuizResult;
}) {
  const cx = 200, cy = 200, r = 170;
  const T  = [cx,     cy - r] as const;
  const L  = [cx - r, cy    ] as const;
  const B  = [cx,     cy + r] as const;
  const R  = [cx + r, cy    ] as const;
  const ro = r / 2, ri = r * 0.35;
  const TL  = [cx - ro, cy - ro] as const;
  const TR  = [cx + ro, cy - ro] as const;
  const BL  = [cx - ro, cy + ro] as const;
  const BR  = [cx + ro, cy + ro] as const;
  const TLi = [cx - ri, cy - ri] as const;
  const TRi = [cx + ri, cy - ri] as const;
  const BLi = [cx - ri, cy + ri] as const;
  const BRi = [cx + ri, cy + ri] as const;
  const pts = (...coords: readonly (readonly [number, number])[]) =>
    coords.map(([x, y]) => `${x},${y}`).join(" ");
  const dotX = cx + r * (economicScore - personalScore) / 100;
  const dotY = cy - r * (economicScore + personalScore - 100) / 100;
  const dotColor = RESULT_META[result].color;
  const personalTicks = [20, 40, 60, 80].map(s => ({
    s, x: B[0] + (L[0] - B[0]) * s / 100, y: B[1] + (L[1] - B[1]) * s / 100,
  }));
  const economicTicks = [20, 40, 60, 80].map(s => ({
    s, x: B[0] + (R[0] - B[0]) * s / 100, y: B[1] + (R[1] - B[1]) * s / 100,
  }));

  return (
    <svg
      viewBox="0 0 420 455"
      width={370}
      height={398}
      style={{ display: "block", maxWidth: "100%" }}
      aria-label="Nolan Chart — political quiz results"
    >
      <defs>
        <clipPath id="nolan-clip-sp">
          <polygon points={pts(T, R, B, L)} />
        </clipPath>
      </defs>
      <g clipPath="url(#nolan-clip-sp)">
        <polygon points={pts(T, TR, TRi, TLi, TL)} fill="rgba(234,179,8,0.55)" />
        <polygon points={pts(L, TL, TLi, BLi, BL)} fill="rgba(59,130,246,0.5)" />
        <polygon points={pts(R, TR, TRi, BRi, BR)} fill="rgba(239,68,68,0.5)" />
        <polygon points={pts(B, BL, BLi, BRi, BR)} fill="rgba(20,30,48,0.92)" />
        <polygon points={pts(TLi, TRi, BRi, BLi)}  fill="rgba(100,116,139,0.5)" />
      </g>
      <g clipPath="url(#nolan-clip-sp)">
        <line x1={TL[0]} y1={TL[1]} x2={BR[0]} y2={BR[1]} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        <line x1={TR[0]} y1={TR[1]} x2={BL[0]} y2={BL[1]} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      </g>
      <polygon points={pts(T, R, B, L)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
      <text x={cx}          y={cy - r + 36} textAnchor="middle" fill="rgba(255,255,255,0.9)"  fontSize={10} fontWeight={700} letterSpacing={0.8}>LIBERTARIAN</text>
      <text x={cx - r + 46} y={cy + 5}      textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}  fontWeight={700} letterSpacing={0.5} transform={`rotate(-45,${cx - r + 46},${cy})`}>PROGRESSIVE</text>
      <text x={cx + r - 46} y={cy + 5}      textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}  fontWeight={700} letterSpacing={0.5} transform={`rotate(45,${cx + r - 46},${cy})`}>CONSERVATIVE</text>
      <text x={cx}          y={cy + r - 28} textAnchor="middle" fill="rgba(255,255,255,0.7)"  fontSize={10} fontWeight={700} letterSpacing={0.8}>AUTHORITARIAN</text>
      <text x={cx}          y={cy + 4}      textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={9}  fontWeight={700} letterSpacing={0.5}>MODERATE</text>
      {personalTicks.map(({ s, x, y }) => (
        <g key={`p${s}`}>
          <line x1={x + 3.5} y1={y - 3.5} x2={x - 3.5} y2={y + 3.5} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          <text x={x - 8} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize={7}>{s}</text>
        </g>
      ))}
      {economicTicks.map(({ s, x, y }) => (
        <g key={`e${s}`}>
          <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          <text x={x + 8} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize={7}>{s}</text>
        </g>
      ))}
      <text x={cx - r * 0.58} y={cy + r + 28} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8}>← Personal Issues Score</text>
      <text x={cx + r * 0.58} y={cy + r + 28} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8}>Economic Issues Score →</text>
      <circle cx={dotX} cy={dotY} r={16} fill={dotColor} opacity={0.22} />
      <circle cx={dotX} cy={dotY} r={9}  fill={dotColor} stroke="white" strokeWidth={2.5} />
      <circle cx={dotX} cy={dotY} r={3}  fill="white" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SurveyPanel({
  surveyId,
  tenantId,
  title,
  websiteUrl,
  footerText,
  questions,
  postSubmitSurveyId,
  postSubmitQuestions,
  isKiosk,
  branding,
}: SurveyPanelProps) {
  const isWspq = surveyId.startsWith("wspq-");

  // Branding-derived colors (with safe fallbacks)
  const primaryColor = branding?.primaryColor ?? "#2563eb";
  const bgColor = branding?.bgColor ?? "#0B0F17";
  const textColor = branding?.textColor ?? "#F9FAFB";
  const logoUrl = branding?.logoUrl;
  // Contrast-safe button text
  function btnTextColor(bg: string): string {
    const r = parseInt(bg.slice(1,3),16), g = parseInt(bg.slice(3,5),16), b = parseInt(bg.slice(5,7),16);
    return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5 ? "#111827" : "#ffffff";
  }

  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [openAnswer, setOpenAnswer] = useState(""); // for text/number/email/phone/date
  const [personalScore, setPersonalScore] = useState(0);
  const [economicScore, setEconomicScore] = useState(0);
  const [result, setResult] = useState<QuizResult>("moderate");
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState(false);
  // Post-submit form state
  const [psIdx, setPsIdx] = useState(0);
  const [psAnswers, setPsAnswers] = useState<Record<string, string>>({});
  const [psOpenAnswer, setPsOpenAnswer] = useState("");
  const hasPostSubmit = !!(postSubmitQuestions && postSubmitQuestions.length > 0);

  const totalQuestions = questions.length;
  const currentQuestion = questions[current];

  // ── Kiosk auto-reset ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isKiosk || phase !== "thankyou") return;
    setCountdown(12);
  }, [isKiosk, phase]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { resetSurvey(); return; }
    const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const resetSurvey = useCallback(() => {
    setPhase("quiz"); setCurrent(0); setAnswers({});
    setOpenAnswer(""); setPsIdx(0); setPsAnswers({}); setPsOpenAnswer("");
    setCountdown(null); setShareToast(false);
  }, []);

  // ── Answer selection ────────────────────────────────────────────────────────
  function selectAnswer(ans: string) {
    const updated = { ...answers, [currentQuestion.id]: ans };
    setAnswers(updated);
    setOpenAnswer(""); // reset open input for next question
    if (current < totalQuestions - 1) {
      setCurrent(current + 1);
    } else {
      if (isWspq) {
        const { personal, economic } = computeScores(questions, updated);
        setPersonalScore(personal);
        setEconomicScore(economic);
        setResult(computeResult(personal, economic));
      }
      setPhase("results");
    }
  }

  // For open-ended types: manually advance to next question
  function advanceOpenAnswer() {
    const val = openAnswer.trim();
    if (!val && currentQuestion.required) return;
    const updated = { ...answers, [currentQuestion.id]: val };
    setAnswers(updated);
    setOpenAnswer("");
    if (current < totalQuestions - 1) {
      setCurrent(current + 1);
    } else {
      setPhase("results");
    }
  }

  const OPEN_TYPES = ["text", "text_short", "number", "email", "phone", "date"];
  const isOpenType = OPEN_TYPES.includes(currentQuestion?.question_type ?? "");

  // ── Submit main survey answers ──────────────────────────────────────────────
  async function submitMainSurvey() {
    setSubmitting(true);
    try {
      if (isWspq) {
        await fetch("/api/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            survey_id: surveyId,
            tenant_id: tenantId,
            answers,
            personal_score: personalScore,
            economic_score: economicScore,
            result,
          }),
        });
      } else {
        await fetch("/api/survey/panel-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ survey_id: surveyId, tenant_id: tenantId, answers }),
        });
      }
    } catch { /* don't block */ } finally {
      setSubmitting(false);
    }
  }

  // ── Submit post-submit form answers ─────────────────────────────────────────
  async function submitPostSubmit() {
    if (!postSubmitSurveyId) { setPhase("thankyou"); return; }
    setSubmitting(true);
    try {
      await fetch("/api/survey/panel-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_id: postSubmitSurveyId, tenant_id: tenantId, answers: psAnswers }),
      });
    } catch { /* don't block */ } finally {
      setSubmitting(false);
      setPhase("thankyou");
    }
  }

  async function handleShare() {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  }

  // ── Styles (branding-aware) ──────────────────────────────────────────────────
  // Determine if bg is dark to choose appropriate secondary colors
  const r0 = parseInt(bgColor.slice(1,3)||"0b",16);
  const g0 = parseInt(bgColor.slice(3,5)||"0f",16);
  const b0 = parseInt(bgColor.slice(5,7)||"17",16);
  const bgLum = (0.299*r0 + 0.587*g0 + 0.114*b0)/255;
  const isDark = bgLum < 0.5;

  const cardBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const mutedText = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  const card: React.CSSProperties = {
    background: cardBg,
    borderRadius: 16,
    padding: "32px 28px",
    maxWidth: 480,
    width: "100%",
    boxShadow: isDark ? "0 4px 32px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.1)",
  };

  const btn = (color: string, tc?: string): React.CSSProperties => ({
    display: "block",
    width: "100%",
    padding: "14px 20px",
    fontSize: 17,
    fontWeight: 700,
    borderRadius: 10,
    border: "none",
    background: color,
    color: tc ?? btnTextColor(color.startsWith("#") ? color : primaryColor),
    cursor: "pointer",
    textAlign: "center",
    transition: "opacity 0.15s",
    letterSpacing: 0.3,
  });

  const ghostBtn: React.CSSProperties = {
    background: "transparent",
    border: `1px solid ${borderColor}`,
    color: mutedText,
    borderRadius: 10,
    padding: "10px 20px",
    fontSize: 14,
    cursor: "pointer",
    width: "100%",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    fontSize: 15,
    background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.7)",
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    color: textColor,
    outline: "none",
    boxSizing: "border-box",
  };

  // WSPQ uses fixed answer options; standard surveys use options from the DB
  const wspqOptions = [
    { value: "agree",    label: "Agree",         color: "#16a34a" },
    { value: "maybe",    label: "Maybe / Unsure", color: "#d97706" },
    { value: "disagree", label: "Disagree",       color: "#dc2626" },
  ];

  // ── Phase: Quiz ─────────────────────────────────────────────────────────────
  if (phase === "quiz") {
    const progress = (Object.keys(answers).length / totalQuestions) * 100;
    const qType = currentQuestion?.question_type ?? "multiple_choice";
    const isDropdown = currentQuestion?.display_format === "dropdown";
    const choiceOptions = isWspq
      ? wspqOptions
      : (currentQuestion?.options ?? []).map(o => ({ value: o, label: o, color: primaryColor }));
    const isMultiSelect = ["multiple_select", "multiple_select_with_other"].includes(qType);
    const [multiVals, setMultiVals] = [
      answers[currentQuestion?.id] ? (() => { try { return JSON.parse(answers[currentQuestion.id]); } catch { return []; } })() : [],
      (vals: string[]) => setAnswers({ ...answers, [currentQuestion.id]: JSON.stringify(vals) }),
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px", background: bgColor }}>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain", maxWidth: 160 }} />
        )}
        <div style={card}>
          <p style={{ color: mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 4px", textTransform: "uppercase" }}>
            {title}
          </p>
          <div style={{ height: 4, background: borderColor, borderRadius: 2, margin: "8px 0 20px" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: primaryColor, borderRadius: 2, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: mutedText, fontSize: 13 }}>Question {current + 1} of {totalQuestions}</span>
            {isWspq && (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
                background: currentQuestion?.order_index <= 5 ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)",
                color: currentQuestion?.order_index <= 5 ? "#93c5fd" : "#fca5a5",
              }}>
                {currentQuestion?.order_index <= 5 ? "PERSONAL FREEDOM" : "ECONOMIC FREEDOM"}
              </span>
            )}
          </div>
          <p style={{ fontSize: 20, fontWeight: 600, color: textColor, lineHeight: 1.45, margin: "0 0 28px" }}>
            {currentQuestion?.question_text}
            {currentQuestion?.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
          </p>

          {/* Choice questions */}
          {(isWspq || ["multiple_choice", "multiple_choice_with_other"].includes(qType)) && !isMultiSelect && (
            <>
              {isDropdown && !isWspq ? (
                <select
                  value={answers[currentQuestion?.id] || ""}
                  onChange={(e) => e.target.value && selectAnswer(e.target.value)}
                  style={{ ...input, fontSize: 16, cursor: "pointer" }}
                >
                  <option value="">— Select —</option>
                  {choiceOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  {qType === "multiple_choice_with_other" && <option value="other">Other…</option>}
                </select>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {choiceOptions.map(({ value, label, color }) => {
                    const isSelected = answers[currentQuestion?.id] === value;
                    return (
                      <button
                        key={value}
                        onClick={() => selectAnswer(value)}
                        style={{
                          ...btn(isSelected ? color : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), isSelected ? btnTextColor(color.startsWith("#") ? color : primaryColor) : textColor),
                          border: isSelected ? `2px solid ${color}` : `2px solid ${borderColor}`,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {qType === "multiple_choice_with_other" && !isWspq && (
                    <button
                      onClick={() => selectAnswer("other")}
                      style={{ ...btn(answers[currentQuestion?.id] === "other" ? primaryColor : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), answers[currentQuestion?.id] === "other" ? btnTextColor(primaryColor) : textColor), border: `2px solid ${borderColor}` }}
                    >
                      Other…
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Multi-select */}
          {isMultiSelect && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(currentQuestion?.options ?? []).map((opt: string) => {
                const checked = multiVals.includes(opt);
                return (
                  <label key={opt} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "12px 16px", borderRadius: 10, border: `2px solid ${checked ? primaryColor : borderColor}`, background: checked ? `${primaryColor}15` : "transparent" }}>
                    <input type="checkbox" checked={checked} onChange={() => {
                      const next = checked ? multiVals.filter((v: string) => v !== opt) : [...multiVals, opt];
                      setMultiVals(next);
                    }} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 16, color: textColor }}>{opt}</span>
                  </label>
                );
              })}
              <button onClick={() => selectAnswer(answers[currentQuestion.id] || "[]")} style={btn(primaryColor)} disabled={!multiVals.length && currentQuestion?.required}>
                Next →
              </button>
            </div>
          )}

          {/* Yes/No */}
          {qType === "yes_no" && (
            <div style={{ display: "flex", gap: 12 }}>
              {["Yes", "No"].map((opt) => {
                const isSelected = answers[currentQuestion?.id] === opt;
                return (
                  <button key={opt} onClick={() => selectAnswer(opt)}
                    style={{ flex: 1, padding: "16px", borderRadius: 12, fontSize: 18, fontWeight: 700, border: `2px solid ${isSelected ? primaryColor : borderColor}`, background: isSelected ? `${primaryColor}20` : "transparent", color: textColor, cursor: "pointer" }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Rating scale */}
          {qType === "rating" && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {Array.from({ length: parseInt(currentQuestion?.options?.[0] ?? "5") }, (_, i) => i + 1).map((n) => {
                  const val = String(n);
                  const isSelected = answers[currentQuestion?.id] === val;
                  return (
                    <button key={n}
                      style={{ width: 48, height: 48, borderRadius: 10, fontSize: 18, fontWeight: 700, border: `2px solid ${isSelected ? primaryColor : borderColor}`, background: isSelected ? `${primaryColor}20` : "transparent", color: textColor, cursor: "pointer" }}
                      onClick={() => selectAnswer(val)}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Open-ended types */}
          {OPEN_TYPES.includes(qType) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {qType === "text" ? (
                <textarea rows={4} value={openAnswer} onChange={(e) => setOpenAnswer(e.target.value)} placeholder="Your answer…" style={{ ...input, resize: "vertical" }} />
              ) : (
                <input
                  type={qType === "text_short" ? "text" : qType === "number" ? "number" : qType === "email" ? "email" : qType === "phone" ? "tel" : "date"}
                  value={openAnswer}
                  onChange={(e) => setOpenAnswer(e.target.value)}
                  placeholder={qType === "email" ? "email@example.com" : qType === "phone" ? "(555) 555-5555" : "Your answer…"}
                  style={input}
                />
              )}
              <button onClick={advanceOpenAnswer} style={btn(primaryColor)} disabled={!openAnswer.trim() && currentQuestion?.required}>
                {current === totalQuestions - 1 ? "Submit →" : "Next →"}
              </button>
            </div>
          )}

          {current > 0 && !isMultiSelect && !OPEN_TYPES.includes(qType) && (
            <button onClick={() => setCurrent(current - 1)} style={{ ...ghostBtn, marginTop: 16 }}>
              ← Back
            </button>
          )}
        </div>
        {footerText && <SurveyFooter text={footerText} textColor={mutedText} />}
      </div>
    );
  }

  // ── Phase: Results ──────────────────────────────────────────────────────────
  if (phase === "results") {
    const meta = isWspq ? RESULT_META[result] : null;
    const submitColor = meta?.color ?? primaryColor;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", minHeight: "100vh", padding: "32px 16px", background: bgColor }}>
        <div style={{ ...card, maxWidth: 520 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            {logoUrl && <img src={logoUrl} alt="" style={{ height: 32, marginBottom: 12, objectFit: "contain", maxWidth: 120 }} />}
            <p style={{ color: mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 8px", textTransform: "uppercase" }}>{title}</p>
            {isWspq && meta ? (
              <>
                <p style={{ color: mutedText, fontSize: 14, margin: "0 0 2px" }}>You scored</p>
                <h1 style={{ fontSize: 32, fontWeight: 800, color: meta.color, margin: "0 0 8px", lineHeight: 1.1 }}>{meta.label}</h1>
                <p style={{ color: mutedText, fontSize: 14, margin: "0 0 4px" }}>
                  Personal: <strong style={{ color: textColor }}>{personalScore}/100</strong>
                  {" · "}
                  Economic: <strong style={{ color: textColor }}>{economicScore}/100</strong>
                </p>
              </>
            ) : (
              <h1 style={{ fontSize: 26, fontWeight: 800, color: textColor, margin: "0 0 8px" }}>All done!</h1>
            )}
          </div>

          {isWspq && meta && (
            <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <NolanChart personalScore={personalScore} economicScore={economicScore} result={result} />
              </div>
              <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, textAlign: "center", margin: "0 0 28px" }}>
                {meta.description}
              </p>
            </>
          )}

          <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            {hasPostSubmit ? (
              <>
                <button
                  disabled={submitting}
                  onClick={async () => { await submitMainSurvey(); setPhase("post_submit"); }}
                  style={btn(submitColor)}
                >
                  {submitting ? "Saving…" : "Continue →"}
                </button>
                <button
                  onClick={async () => { await submitMainSurvey(); setPhase("thankyou"); }}
                  style={ghostBtn}
                >
                  Skip
                </button>
              </>
            ) : (
              <button
                disabled={submitting}
                onClick={async () => { await submitMainSurvey(); setPhase("thankyou"); }}
                style={btn(submitColor)}
              >
                {submitting ? "Saving…" : isWspq ? "Done ✓" : "Submit →"}
              </button>
            )}
          </div>
        </div>
        {footerText && <SurveyFooter text={footerText} />}
      </div>
    );
  }

  // ── Phase: Post-Submit Form ─────────────────────────────────────────────────
  if (phase === "post_submit" && postSubmitQuestions && postSubmitQuestions.length > 0) {
    const psQ = postSubmitQuestions[psIdx];
    const psTotal = postSubmitQuestions.length;
    const psIsLast = psIdx === psTotal - 1;
    const psType = psQ?.question_type ?? "text_short";
    const psIsOpen = ["text", "text_short", "number", "email", "phone", "date"].includes(psType);
    const psVal = psAnswers[psQ?.id] ?? "";
    const psCanNext = psQ?.required ? Boolean(psIsOpen ? psOpenAnswer.trim() : psVal) : true;

    function psSelectAnswer(val: string) {
      const next = { ...psAnswers, [psQ.id]: val };
      setPsAnswers(next);
      if (!psIsLast) { setPsIdx(psIdx + 1); setPsOpenAnswer(""); }
    }

    async function psAdvance() {
      const val = psIsOpen ? psOpenAnswer.trim() : psVal;
      const next = { ...psAnswers, [psQ.id]: val };
      setPsAnswers(next);
      setPsOpenAnswer("");
      if (psIsLast) {
        setSubmitting(true);
        try {
          await fetch("/api/survey/panel-submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ survey_id: postSubmitSurveyId, tenant_id: tenantId, answers: next }),
          });
        } catch { /* don't block */ } finally {
          setSubmitting(false);
          setPhase("thankyou");
        }
      } else {
        setPsIdx(psIdx + 1);
      }
    }

    const psOptions = (psQ?.options ?? []).map((o: string) => ({ value: o, label: o, color: primaryColor }));
    const psProgress = (psIdx / psTotal) * 100;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px", background: bgColor }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain", maxWidth: 160 }} />}
        <div style={card}>
          <p style={{ color: mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 4px", textTransform: "uppercase" }}>
            One more thing…
          </p>
          <div style={{ height: 4, background: borderColor, borderRadius: 2, margin: "8px 0 20px" }}>
            <div style={{ height: "100%", width: `${psProgress}%`, background: primaryColor, borderRadius: 2, transition: "width 0.3s" }} />
          </div>
          <span style={{ color: mutedText, fontSize: 13, display: "block", marginBottom: 16 }}>
            {psIdx + 1} of {psTotal}
          </span>
          <p style={{ fontSize: 20, fontWeight: 600, color: textColor, lineHeight: 1.45, margin: "0 0 24px" }}>
            {psQ?.question_text}
            {psQ?.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
          </p>

          {/* Single-choice options */}
          {["multiple_choice", "multiple_choice_with_other", "yes_no"].includes(psType) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {(psType === "yes_no" ? [{ value: "Yes", label: "Yes", color: primaryColor }, { value: "No", label: "No", color: primaryColor }] : psOptions).map(({ value, label, color }) => {
                const isSel = psAnswers[psQ?.id] === value;
                return (
                  <button key={value} onClick={() => psSelectAnswer(value)} style={{ ...btn(isSel ? color : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), isSel ? btnTextColor(color) : textColor), border: isSel ? `2px solid ${color}` : `2px solid ${borderColor}` }}>
                    {label}
                  </button>
                );
              })}
              {psType === "multiple_choice_with_other" && (
                <button onClick={() => psSelectAnswer("other")} style={{ ...btn(psAnswers[psQ?.id] === "other" ? primaryColor : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), psAnswers[psQ?.id] === "other" ? btnTextColor(primaryColor) : textColor), border: `2px solid ${borderColor}` }}>Other</button>
              )}
            </div>
          )}

          {/* Open-ended */}
          {psIsOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {psType === "text" ? (
                <textarea rows={3} style={{ ...input, resize: "vertical" }} placeholder="Your answer…" value={psOpenAnswer} onChange={e => setPsOpenAnswer(e.target.value)} />
              ) : (
                <input
                  type={psType === "number" ? "number" : psType === "email" ? "email" : psType === "phone" ? "tel" : psType === "date" ? "date" : "text"}
                  style={input} placeholder={psType === "email" ? "email@example.com" : psType === "phone" ? "(555) 555-5555" : "Your answer…"}
                  value={psOpenAnswer} onChange={e => setPsOpenAnswer(e.target.value)}
                />
              )}
              <button onClick={psAdvance} disabled={!psCanNext || submitting} style={btn(primaryColor)}>
                {submitting ? "Saving…" : psIsLast ? "Done ✓" : "Next →"}
              </button>
            </div>
          )}

          {/* Back / Next for choice types */}
          {!psIsOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {psIsLast && psVal && (
                <button onClick={psAdvance} disabled={submitting} style={btn(primaryColor)}>
                  {submitting ? "Saving…" : "Done ✓"}
                </button>
              )}
              {psIdx > 0 && (
                <button onClick={() => setPsIdx(psIdx - 1)} style={ghostBtn}>← Back</button>
              )}
            </div>
          )}
        </div>
        {footerText && <SurveyFooter text={footerText} textColor={mutedText} />}
      </div>
    );
  }

  // ── Phase: Thank You ────────────────────────────────────────────────────────
  const meta = isWspq ? RESULT_META[result] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px", background: bgColor }}>
      <div style={{ ...card, textAlign: "center", maxWidth: 420 }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 36, marginBottom: 12, objectFit: "contain", maxWidth: 120 }} />}
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗳️</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: textColor, margin: "0 0 8px" }}>
          {isWspq ? "Thanks for taking the quiz!" : "Thanks for your response!"}
        </h1>
        <p style={{ color: mutedText, fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          {isWspq && meta ? (
            <>You scored <strong style={{ color: meta.color }}>{meta.label}</strong>. Share this quiz with your friends and see where they stand!</>
          ) : (
            "Your response has been recorded."
          )}
        </p>
        {!isKiosk && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn(primaryColor), textDecoration: "none" }}>
                Learn More →
              </a>
            )}
            <div style={{ position: "relative" }}>
              <button onClick={handleShare} style={btn(isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)", textColor)}>
                Share
              </button>
              {shareToast && (
                <div style={{ position: "absolute", top: -36, left: "50%", transform: "translateX(-50%)", background: "#16a34a", color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 13, whiteSpace: "nowrap" }}>
                  Link copied!
                </div>
              )}
            </div>
            <button onClick={resetSurvey} style={{ ...ghostBtn, marginTop: 4 }}>Take Again</button>
          </div>
        )}
        {isKiosk && countdown !== null && (
          <div style={{ marginTop: 8 }}>
            <p style={{ color: mutedText, fontSize: 13 }}>Resetting in {countdown}s…</p>
            <button onClick={resetSurvey} style={btn(meta?.color ?? primaryColor)}>Start Over Now</button>
          </div>
        )}
      </div>
      {footerText && <SurveyFooter text={footerText} textColor={mutedText} />}
    </div>
  );
}

function SurveyFooter({ text, textColor }: { text: string; textColor?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 16px 8px", color: textColor ?? "rgba(255,255,255,0.25)", fontSize: 11 }}>
      {text}
    </div>
  );
}
