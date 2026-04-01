"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Answer = "agree" | "maybe" | "disagree";
type QuizResult = "libertarian" | "progressive" | "conservative" | "authoritarian" | "moderate";
type Phase = "quiz" | "results" | "thankyou";

interface Question {
  id: string;
  question_text: string;
  order_index: number; // 1–5 = personal, 6–10 = economic
}

interface QuizPanelProps {
  surveyId: string;
  tenantId: string;
  title: string;
  websiteUrl: string | null;
  footerText: string | null;
  questions: Question[];
  isKiosk: boolean;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORE: Record<Answer, number> = { agree: 20, maybe: 10, disagree: 0 };

function computeScores(
  questions: Question[],
  answers: Record<string, Answer>
): { personal: number; economic: number } {
  let personal = 0;
  let economic = 0;
  for (const q of questions) {
    const ans = answers[q.id];
    if (!ans) continue;
    if (q.order_index <= 5) personal += SCORE[ans];
    else economic += SCORE[ans];
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

// ── Result metadata ───────────────────────────────────────────────────────────

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

// ── Nolan Chart SVG (diamond) ─────────────────────────────────────────────────

function NolanChart({
  personalScore,
  economicScore,
  result,
}: {
  personalScore: number;
  economicScore: number;
  result: QuizResult;
}) {
  const cx = 200, cy = 200, r = 145;

  // Outer diamond vertices
  const T  = [cx,     cy - r] as const; // top    — Libertarian
  const L  = [cx - r, cy    ] as const; // left   — Progressive
  const B  = [cx,     cy + r] as const; // bottom — Authoritarian
  const R  = [cx + r, cy    ] as const; // right  — Conservative

  // Zone boundary: outer corners (r/2) + inner Moderate corners (r*0.35)
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

  // Dot position on the diamond
  // T = both 100, L = personal 100 + economic 0, R = economic 100 + personal 0, B = both 0
  const dotX = cx + r * (economicScore - personalScore) / 100;
  const dotY = cy - r * (economicScore + personalScore - 100) / 100;
  const dotColor = RESULT_META[result].color;

  // Tick positions along Personal axis (B→L) and Economic axis (B→R)
  const personalTicks = [20, 40, 60, 80].map(s => {
    const t = s / 100;
    return { s, x: B[0] + (L[0] - B[0]) * t, y: B[1] + (L[1] - B[1]) * t };
  });
  const economicTicks = [20, 40, 60, 80].map(s => {
    const t = s / 100;
    return { s, x: B[0] + (R[0] - B[0]) * t, y: B[1] + (R[1] - B[1]) * t };
  });

  return (
    <svg
      viewBox="0 0 400 430"
      width={340}
      height={366}
      style={{ display: "block", maxWidth: "100%" }}
      aria-label="Nolan Chart — political quiz results"
    >
      <defs>
        <clipPath id="nolan-clip">
          <polygon points={pts(T, R, B, L)} />
        </clipPath>
      </defs>

      {/* Zone fills — clipped to outer diamond */}
      <g clipPath="url(#nolan-clip)">
        {/* Outer zone pentagons (vertex → outer corner → inner corner → inner corner → outer corner) */}
        <polygon points={pts(T, TR, TRi, TLi, TL)} fill="rgba(234,179,8,0.55)" />   {/* Libertarian */}
        <polygon points={pts(L, TL, TLi, BLi, BL)} fill="rgba(59,130,246,0.5)" />   {/* Progressive */}
        <polygon points={pts(R, TR, TRi, BRi, BR)} fill="rgba(239,68,68,0.5)" />    {/* Conservative */}
        <polygon points={pts(B, BL, BLi, BRi, BR)} fill="rgba(20,30,48,0.92)" />    {/* Authoritarian */}
        {/* Moderate — smaller inner square (~12% of diamond area) */}
        <polygon points={pts(TLi, TRi, BRi, BLi)}  fill="rgba(100,116,139,0.5)" />
      </g>

      {/* Zone divider lines */}
      <g clipPath="url(#nolan-clip)">
        <line x1={TL[0]} y1={TL[1]} x2={BR[0]} y2={BR[1]} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        <line x1={TR[0]} y1={TR[1]} x2={BL[0]} y2={BL[1]} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      </g>

      {/* Outer diamond border */}
      <polygon points={pts(T, R, B, L)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />

      {/* Zone labels */}
      <text x={cx}           y={cy - r + 36}  textAnchor="middle" fill="rgba(255,255,255,0.9)"  fontSize={10} fontWeight={700} letterSpacing={0.8}>LIBERTARIAN</text>
      <text x={cx - r + 46}  y={cy + 5}       textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}  fontWeight={700} letterSpacing={0.5} transform={`rotate(-45,${cx - r + 46},${cy})`}>PROGRESSIVE</text>
      <text x={cx + r - 46}  y={cy + 5}       textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}  fontWeight={700} letterSpacing={0.5} transform={`rotate(45,${cx + r - 46},${cy})`}>CONSERVATIVE</text>
      <text x={cx}           y={cy + r - 28}  textAnchor="middle" fill="rgba(255,255,255,0.7)"  fontSize={10} fontWeight={700} letterSpacing={0.8}>AUTHORITARIAN</text>
      <text x={cx}           y={cy + 4}       textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={9}  fontWeight={700} letterSpacing={0.5}>MODERATE</text>

      {/* Tick marks — Personal axis (B→L, bottom-left diagonal) */}
      {personalTicks.map(({ s, x, y }) => (
        <g key={`p${s}`}>
          <line x1={x + 3.5} y1={y - 3.5} x2={x - 3.5} y2={y + 3.5} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          <text x={x - 8} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize={7}>{s}</text>
        </g>
      ))}

      {/* Tick marks — Economic axis (B→R, bottom-right diagonal) */}
      {economicTicks.map(({ s, x, y }) => (
        <g key={`e${s}`}>
          <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          <text x={x + 8} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize={7}>{s}</text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={cx - r * 0.58} y={cy + r + 28} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8}>← Personal Issues Score</text>
      <text x={cx + r * 0.58} y={cy + r + 28} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8}>Economic Issues Score →</text>

      {/* User dot — glow ring, filled circle, center pip */}
      <circle cx={dotX} cy={dotY} r={16} fill={dotColor} opacity={0.22} />
      <circle cx={dotX} cy={dotY} r={9}  fill={dotColor} stroke="white" strokeWidth={2.5} />
      <circle cx={dotX} cy={dotY} r={3}  fill="white" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QuizPanel({
  surveyId,
  tenantId,
  title,
  websiteUrl,
  footerText,
  questions,
  isKiosk,
}: QuizPanelProps) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
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
    if (countdown <= 0) {
      resetQuiz();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const resetQuiz = useCallback(() => {
    setPhase("quiz");
    setCurrent(0);
    setAnswers({});
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setCountdown(null);
    setShareToast(false);
  }, []);

  // ── Answer selection ────────────────────────────────────────────────────────
  function selectAnswer(ans: Answer) {
    const updated = { ...answers, [currentQuestion.id]: ans };
    setAnswers(updated);
    if (current < totalQuestions - 1) {
      setCurrent(current + 1);
    } else {
      // All answered — compute results
      const { personal, economic } = computeScores(questions, updated);
      const res = computeResult(personal, economic);
      setPersonalScore(personal);
      setEconomicScore(economic);
      setResult(res);
      setPhase("results");
    }
  }

  // ── Contact form submit ─────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim() && !email.trim() && !phone.trim()) {
      setPhase("thankyou");
      return;
    }
    setSubmitting(true);
    try {
      const answersPayload: Record<string, Answer> = {};
      for (const q of questions) {
        if (answers[q.id]) answersPayload[q.id] = answers[q.id];
      }
      await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey_id: surveyId,
          tenant_id: tenantId,
          answers: answersPayload,
          personal_score: personalScore,
          economic_score: economicScore,
          result,
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
    } catch {
      // Don't block the thank-you on network error
    } finally {
      setSubmitting(false);
      setPhase("thankyou");
    }
  }

  async function handleShare() {
    const url = window.location.href.split("?")[0]; // strip kiosk param
    if (navigator.share) {
      try {
        await navigator.share({ title: "World's Smallest Political Quiz", url });
      } catch {
        // user cancelled or not supported
      }
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

  // ── Phase: Quiz ─────────────────────────────────────────────────────────────
  if (phase === "quiz") {
    const progress = (Object.keys(answers).length / totalQuestions) * 100;
    const qType = currentQuestion?.order_index <= 5 ? "PERSONAL FREEDOM" : "ECONOMIC FREEDOM";

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
        <div style={card}>
          {/* Header */}
          <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 4px", textTransform: "uppercase" }}>
            {title}
          </p>

          {/* Progress bar */}
          <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, margin: "8px 0 20px" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#eab308", borderRadius: 2, transition: "width 0.3s" }} />
          </div>

          {/* Question counter + category */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>Question {current + 1} of {totalQuestions}</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
              background: currentQuestion?.order_index <= 5 ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)",
              color: currentQuestion?.order_index <= 5 ? "#93c5fd" : "#fca5a5" }}>
              {qType}
            </span>
          </div>

          {/* Question text */}
          <p style={{ fontSize: 20, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.45, margin: "0 0 28px" }}>
            {currentQuestion?.question_text}
          </p>

          {/* Answer buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(["agree", "maybe", "disagree"] as Answer[]).map((ans) => {
              const colors: Record<Answer, string> = {
                agree: "#16a34a",
                maybe: "#d97706",
                disagree: "#dc2626",
              };
              const labels: Record<Answer, string> = {
                agree: "Agree",
                maybe: "Maybe / Unsure",
                disagree: "Disagree",
              };
              const isSelected = answers[currentQuestion?.id] === ans;
              return (
                <button
                  key={ans}
                  onClick={() => selectAnswer(ans)}
                  style={{
                    ...btn(isSelected ? colors[ans] : "rgba(255,255,255,0.07)", isSelected ? "#fff" : "#cbd5e1"),
                    border: isSelected ? `2px solid ${colors[ans]}` : "2px solid transparent",
                  }}
                >
                  {labels[ans]}
                </button>
              );
            })}
          </div>

          {/* Back button */}
          {current > 0 && (
            <button
              onClick={() => setCurrent(current - 1)}
              style={{ ...ghostBtn, marginTop: 16 }}
            >
              ← Back
            </button>
          )}
        </div>
        {footerText && <QuizFooter text={footerText} />}
      </div>
    );
  }

  // ── Phase: Results ──────────────────────────────────────────────────────────
  if (phase === "results") {
    const meta = RESULT_META[result];

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", minHeight: "100vh", padding: "32px 16px" }}>
        <div style={{ ...card, maxWidth: 520 }}>
          {/* Result header */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 8px", textTransform: "uppercase" }}>{title}</p>
            <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 2px" }}>You scored</p>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: meta.color, margin: "0 0 8px", lineHeight: 1.1 }}>{meta.label}</h1>
            <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 4px" }}>
              Personal: <strong style={{ color: "#e2e8f0" }}>{personalScore}/100</strong>
              {" · "}
              Economic: <strong style={{ color: "#e2e8f0" }}>{economicScore}/100</strong>
            </p>
          </div>

          {/* Nolan Chart */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <NolanChart personalScore={personalScore} economicScore={economicScore} result={result} />
          </div>

          {/* Description */}
          <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, textAlign: "center", margin: "0 0 28px" }}>
            {meta.description}
          </p>

          {/* Contact form */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24 }}>
            <p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
              Want to stay connected?
            </p>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
              Leave your info below — all fields optional.
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input
                  style={input}
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
                <input
                  style={input}
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                <input
                  style={input}
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <input
                  style={input}
                  type="tel"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <button type="submit" disabled={submitting} style={btn(meta.color)}>
                {submitting ? "Saving…" : "Save My Results"}
              </button>
              <button type="button" onClick={() => setPhase("thankyou")} style={{ ...ghostBtn, marginTop: 10 }}>
                Skip
              </button>
            </form>
          </div>
        </div>
        {footerText && <QuizFooter text={footerText} />}
      </div>
    );
  }

  // ── Phase: Thank You ────────────────────────────────────────────────────────
  const meta = RESULT_META[result];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ ...card, textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗳️</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>Thanks for taking the quiz!</h1>
        <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          You scored <strong style={{ color: meta.color }}>{meta.label}</strong>.
          Share this quiz with your friends and see where they stand!
        </p>

        {!isKiosk && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btn("#2563eb"), textDecoration: "none" }}
              >
                Learn More →
              </a>
            )}
            <div style={{ position: "relative" }}>
              <button onClick={handleShare} style={btn("rgba(255,255,255,0.1)", "#e2e8f0")}>
                Share Quiz
              </button>
              {shareToast && (
                <div style={{
                  position: "absolute", top: -36, left: "50%", transform: "translateX(-50%)",
                  background: "#16a34a", color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 13, whiteSpace: "nowrap",
                }}>
                  Link copied!
                </div>
              )}
            </div>
            <button onClick={resetQuiz} style={{ ...ghostBtn, marginTop: 4 }}>Take Again</button>
          </div>
        )}

        {isKiosk && countdown !== null && (
          <div style={{ marginTop: 8 }}>
            <p style={{ color: "#475569", fontSize: 13 }}>Resetting in {countdown}s…</p>
            <button onClick={resetQuiz} style={btn(meta.color)}>Start Over Now</button>
          </div>
        )}
      </div>
      {footerText && <QuizFooter text={footerText} />}
    </div>
  );
}

function QuizFooter({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 16px 8px", color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
      {text}
    </div>
  );
}
