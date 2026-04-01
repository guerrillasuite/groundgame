"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "quiz" | "results" | "thankyou";
type QuizResult = "libertarian" | "progressive" | "conservative" | "authoritarian" | "moderate";

interface Question {
  id: string;
  question_text: string;
  order_index: number;
  options: string[] | null;
}

interface SurveyPanelProps {
  surveyId: string;
  tenantId: string;
  title: string;
  websiteUrl: string | null;
  footerText: string | null;
  questions: Question[];
  isKiosk: boolean;
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
  if (personal >= 60 && economic >= 60) return "libertarian";
  if (personal >= 60 && economic < 60) return "progressive";
  if (personal < 60 && economic >= 60) return "conservative";
  if (personal < 60 && economic < 60 && (personal < 40 || economic < 40)) return "authoritarian";
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
  isKiosk,
}: SurveyPanelProps) {
  const isWspq = surveyId.startsWith("wspq-");

  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [personalScore, setPersonalScore] = useState(0);
  const [economicScore, setEconomicScore] = useState(0);
  const [result, setResult] = useState<QuizResult>("moderate");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState(false);

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
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setCountdown(null); setShareToast(false);
  }, []);

  // ── Answer selection ────────────────────────────────────────────────────────
  function selectAnswer(ans: string) {
    const updated = { ...answers, [currentQuestion.id]: ans };
    setAnswers(updated);
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

  // ── Contact form submit ─────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
            first_name: firstName.trim() || undefined,
            last_name: lastName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
          }),
        });
      } else {
        await fetch("/api/survey/panel-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            survey_id: surveyId,
            tenant_id: tenantId,
            answers,
            first_name: firstName.trim() || undefined,
            last_name: lastName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
          }),
        });
      }
    } catch {
      // Don't block the thank-you on network error
    } finally {
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

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#1e293b",
    borderRadius: 16,
    padding: "32px 28px",
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
  };

  const btn = (color: string, textColor = "#fff"): React.CSSProperties => ({
    display: "block",
    width: "100%",
    padding: "14px 20px",
    fontSize: 17,
    fontWeight: 700,
    borderRadius: 10,
    border: "none",
    background: color,
    color: textColor,
    cursor: "pointer",
    textAlign: "center",
    transition: "opacity 0.15s",
    letterSpacing: 0.3,
  });

  const ghostBtn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "rgba(255,255,255,0.6)",
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
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: "#f1f5f9",
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
    const options = isWspq
      ? wspqOptions
      : (currentQuestion?.options ?? []).map(o => ({ value: o, label: o, color: "#2563eb" }));

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
        <div style={card}>
          <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 4px", textTransform: "uppercase" }}>
            {title}
          </p>
          <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, margin: "8px 0 20px" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#eab308", borderRadius: 2, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>Question {current + 1} of {totalQuestions}</span>
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
          <p style={{ fontSize: 20, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.45, margin: "0 0 28px" }}>
            {currentQuestion?.question_text}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {options.map(({ value, label, color }) => {
              const isSelected = answers[currentQuestion?.id] === value;
              return (
                <button
                  key={value}
                  onClick={() => selectAnswer(value)}
                  style={{
                    ...btn(isSelected ? color : "rgba(255,255,255,0.07)", isSelected ? "#fff" : "#cbd5e1"),
                    border: isSelected ? `2px solid ${color}` : "2px solid transparent",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {current > 0 && (
            <button onClick={() => setCurrent(current - 1)} style={{ ...ghostBtn, marginTop: 16 }}>
              ← Back
            </button>
          )}
        </div>
        {footerText && <SurveyFooter text={footerText} />}
      </div>
    );
  }

  // ── Phase: Results ──────────────────────────────────────────────────────────
  if (phase === "results") {
    const meta = isWspq ? RESULT_META[result] : null;
    const submitColor = meta?.color ?? "#2563eb";

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", minHeight: "100vh", padding: "32px 16px" }}>
        <div style={{ ...card, maxWidth: 520 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 8px", textTransform: "uppercase" }}>{title}</p>
            {isWspq && meta ? (
              <>
                <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 2px" }}>You scored</p>
                <h1 style={{ fontSize: 32, fontWeight: 800, color: meta.color, margin: "0 0 8px", lineHeight: 1.1 }}>{meta.label}</h1>
                <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 4px" }}>
                  Personal: <strong style={{ color: "#e2e8f0" }}>{personalScore}/100</strong>
                  {" · "}
                  Economic: <strong style={{ color: "#e2e8f0" }}>{economicScore}/100</strong>
                </p>
              </>
            ) : (
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>All done!</h1>
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

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24 }}>
            <p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
              Want to stay connected?
            </p>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
              Leave your info below — all fields optional.
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input style={input} placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />
                <input style={input} placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                <input style={input} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                <input style={input} type="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
              </div>
              <button type="submit" disabled={submitting} style={btn(submitColor)}>
                {submitting ? "Saving…" : "Save My Results"}
              </button>
              <button type="submit" style={{ ...ghostBtn, marginTop: 10 }}>
                Skip
              </button>
            </form>
          </div>
        </div>
        {footerText && <SurveyFooter text={footerText} />}
      </div>
    );
  }

  // ── Phase: Thank You ────────────────────────────────────────────────────────
  const meta = isWspq ? RESULT_META[result] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ ...card, textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗳️</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>
          {isWspq ? "Thanks for taking the quiz!" : "Thanks for your response!"}
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          {isWspq && meta ? (
            <>You scored <strong style={{ color: meta.color }}>{meta.label}</strong>. Share this quiz with your friends and see where they stand!</>
          ) : (
            "Your response has been recorded."
          )}
        </p>
        {!isKiosk && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn("#2563eb"), textDecoration: "none" }}>
                Learn More →
              </a>
            )}
            <div style={{ position: "relative" }}>
              <button onClick={handleShare} style={btn("rgba(255,255,255,0.1)", "#e2e8f0")}>
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
            <p style={{ color: "#475569", fontSize: 13 }}>Resetting in {countdown}s…</p>
            <button onClick={resetSurvey} style={btn(meta?.color ?? "#2563eb")}>Start Over Now</button>
          </div>
        )}
      </div>
      {footerText && <SurveyFooter text={footerText} />}
    </div>
  );
}

function SurveyFooter({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 16px 8px", color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
      {text}
    </div>
  );
}
