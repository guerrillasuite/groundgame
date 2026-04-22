"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import MarkdownText from "@/app/components/MarkdownText";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "quiz" | "results" | "payment" | "thankyou";
type QuizResult = "libertarian" | "progressive" | "conservative" | "authoritarian" | "moderate";

interface Question {
  id: string;
  question_text: string;
  description?: string | null;
  question_type: string;
  order_index: number;
  options: string[] | null;
  display_format: string | null;
  randomize_choices?: boolean;
  required?: boolean;
  conditions?: {
    show_if: { question_id: string; operator: "equals" | "not_equals" | "contains"; value: string };
  } | null;
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
  displayDescription?: string | null;
  websiteUrl: string | null;
  learnMoreLabel?: string | null;
  footerText: string | null;
  postSubmitHeader?: string | null;
  thankyouMessage?: string | null;
  questions: Question[];
  postSubmitSurveyId?: string | null;
  postSubmitQuestions?: Question[] | null;
  postSubmitRequired?: boolean;
  showShare?: boolean;
  showTakeAgain?: boolean;
  isKiosk: boolean;
  contactId?: string | null;
  initialAnswers?: Record<string, string>;
  initialPostSubmitAnswers?: Record<string, string>;
  branding?: Branding;
  viewConfig?: { pagination?: string; page_groups?: string[][][] | null };
  deliveryEnabled?: boolean;
  orderProducts?: string[] | null;
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

// ── Conditional visibility ─────────────────────────────────────────────────────

function isQuestionVisible(q: Question, answers: Record<string, string>): boolean {
  const c = q.conditions?.show_if;
  if (!c?.question_id) return true;
  const actual = String(answers[c.question_id] ?? "").toLowerCase();
  const target = String(c.value ?? "").toLowerCase();
  if (c.operator === "equals")     return actual === target;
  if (c.operator === "not_equals") return actual !== target;
  if (c.operator === "contains")   return actual.includes(target);
  return true;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SurveyPanel({
  surveyId,
  tenantId,
  title,
  displayDescription,
  websiteUrl,
  learnMoreLabel,
  footerText,
  postSubmitHeader,
  thankyouMessage,
  questions,
  postSubmitSurveyId,
  postSubmitQuestions,
  postSubmitRequired,
  showShare = true,
  showTakeAgain = true,
  isKiosk,
  contactId,
  initialAnswers,
  initialPostSubmitAnswers,
  branding,
  viewConfig,
  deliveryEnabled,
  orderProducts,
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

  // Compute shuffled options once per question (stable across re-renders)
  const shuffledOptionsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const q of questions) {
      if (q.randomize_choices && Array.isArray(q.options) && q.options.length > 0) {
        const shuffled = [...q.options];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        map[q.id] = shuffled;
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.map(q => q.id).join(",")]);

  const [phase, setPhase] = useState<Phase>("quiz");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {});
  const [openAnswer, setOpenAnswer] = useState(""); // for text/number/email/phone/date
  const [otherMultiText, setOtherMultiText] = useState(""); // for multiple_select_with_other
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({}); // persists other text across all questions
  const [personalScore, setPersonalScore] = useState(0);
  const [economicScore, setEconomicScore] = useState(0);
  const [result, setResult] = useState<QuizResult>("moderate");
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState(false);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  // Delivery state
  const [deliveryMode, setDeliveryMode] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddr, setDeliveryAddr] = useState({ address_line1: "", city: "", state: "", postal_code: "" });
  // Products state
  const [formProducts, setFormProducts] = useState<{ id: string; name: string; sku: string | null }[]>([]);
  // Post-submit form state (always rendered inline on results page, all at once)
  const [psAnswers, setPsAnswers] = useState<Record<string, string>>(initialPostSubmitAnswers ?? {});
  const hasPostSubmit = !!(postSubmitQuestions && postSubmitQuestions.length > 0);

  const totalQuestions = questions.length;
  const currentQuestion = questions[current];

  // ── Sync openAnswer from prefilled answers when navigating to a text question ──
  useEffect(() => {
    if (!currentQuestion) return;
    if (["text", "text_short", "number", "email", "phone", "date"].includes(currentQuestion.question_type ?? "")) {
      setOpenAnswer(answers[currentQuestion.id] ?? "");
    }
  }, [current]);

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
    setOpenAnswer(""); setPsAnswers({});
    setDeliveryMode("pickup");
    setDeliveryAddr({ address_line1: "", city: "", state: "", postal_code: "" });
    setCountdown(null); setShareToast(false);
  }, []);

  // Load products for product_picker questions
  useEffect(() => {
    if (!questions.some((q) => q.question_type === "product_picker")) return;
    const url = orderProducts?.length
      ? `/api/crm/products?ids=${orderProducts.join(",")}`
      : "/api/crm/products";
    fetch(url).then((r) => r.json()).then((list) => setFormProducts(Array.isArray(list) ? list : [])).catch(() => {});
  }, [questions, orderProducts]);

  // ── Answer selection ────────────────────────────────────────────────────────
  function nextVisibleIdx(from: number, updatedAnswers: Record<string, string>): number | "end" {
    for (let i = from; i < questions.length; i++) {
      if (isQuestionVisible(questions[i], updatedAnswers)) return i;
    }
    return "end";
  }

  function selectAnswer(ans: string) {
    const updated = { ...answers, [currentQuestion.id]: ans };
    setAnswers(updated);
    saveAnswerNow(currentQuestion.id, ans);
    setOpenAnswer(""); // reset open input for next question
    const next = nextVisibleIdx(current + 1, updated);
    if (next !== "end") {
      setCurrent(next);
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
    saveAnswerNow(currentQuestion.id, val);
    setOpenAnswer("");
    const next = nextVisibleIdx(current + 1, updated);
    if (next !== "end") {
      setCurrent(next);
    } else {
      setPhase("results");
    }
  }

  // ── Save-as-you-go ──────────────────────────────────────────────────────────
  // When contactId is known, persist each answer immediately so responses are
  // saved even if the user abandons before final submission.
  function saveAnswerNow(questionId: string, answerValue: string, answerText?: string) {
    if (!contactId) return;
    fetch("/api/survey/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crm_contact_id: contactId,
        survey_id: surveyId,
        question_id: questionId,
        answer_value: answerValue,
        answer_text: answerText ?? null,
      }),
    }).catch(() => {}); // fire-and-forget, don't block UX
  }

  const OPEN_TYPES = ["text", "text_short", "number", "email", "phone", "date"];
  const isOpenType = OPEN_TYPES.includes(currentQuestion?.question_type ?? "");

  // ── Submit main survey answers ──────────────────────────────────────────────
  // Returns { payment_required, opportunity_id } from panel-submit response.
  async function submitMainSurvey(overrideContactId?: string): Promise<{ payment_required: boolean; opportunity_id: string | null }> {
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
        return { payment_required: false, opportunity_id: null };
      } else {
        const deliveryPayload = (deliveryEnabled && deliveryMode === "delivery" && deliveryAddr.address_line1.trim())
          ? deliveryAddr : null;
        const res = await fetch("/api/survey/panel-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ survey_id: surveyId, tenant_id: tenantId, answers, other_texts: otherTexts, delivery: deliveryPayload, contact_id: overrideContactId || contactId || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.opportunity_id) setOpportunityId(data.opportunity_id);
        return { payment_required: Boolean(data.payment_required), opportunity_id: data.opportunity_id ?? null };
      }
    } catch {
      return { payment_required: false, opportunity_id: null };
    } finally {
      setSubmitting(false);
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

  // ── Phase: Quiz (all-at-once mode) ──────────────────────────────────────────
  if (phase === "quiz" && viewConfig?.pagination === "all_at_once" && !isWspq) {
    const visibleQuestions = questions.filter((q) => isQuestionVisible(q, answers));
    const allAnswered = visibleQuestions.every(q => {
      if (!q.required) return true;
      if (q.question_type === "product_picker") {
        try { const items = JSON.parse(answers[q.id] || "[]"); return items.length > 0 && items.every((i: any) => i.product_id && i.qty >= 1); } catch { return false; }
      }
      return Boolean(answers[q.id]);
    });
    const deliveryValid = !deliveryEnabled || deliveryMode === "pickup" || deliveryAddr.address_line1.trim();
    const qMap = new Map(questions.map(q => [q.id, q]));
    const rawRows: string[][] = viewConfig?.page_groups?.[0] ?? questions.map(q => [q.id]);
    const visibleIds = new Set(visibleQuestions.map(q => q.id));
    const rows: Question[][] = rawRows
      .map(row => row.map(id => qMap.get(id)).filter((q): q is Question => q != null && visibleIds.has(q.id)))
      .filter(row => row.length > 0);
    const inRows = new Set(rawRows.flat());
    visibleQuestions.filter(q => !inRows.has(q.id)).forEach(q => rows.push([q]));
    const hasTwoCol = rows.some(r => r.length === 2);

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", minHeight: "100vh", padding: "32px 16px", background: bgColor }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain", maxWidth: 160 }} />}
        <div style={{ ...card, maxWidth: hasTwoCol ? 840 : 520, width: "100%" }}>
          <p style={{ color: mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, margin: displayDescription ? "0 0 6px" : "0 0 20px", textTransform: "uppercase" }}>{title}</p>
          {displayDescription && (displayDescription.trimStart().startsWith("<")
            ? <div className="rich-text-content" style={{ color: mutedText, fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: displayDescription }} />
            : <p style={{ color: mutedText, fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 }}>{displayDescription}</p>
          )}
          <form onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              const { payment_required } = await submitMainSurvey();
              if (payment_required) setPhase("payment");
              else setPhase(hasPostSubmit ? "results" : "thankyou");
            } catch { /* proceed */ } finally { setSubmitting(false); }
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 24 }}>
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} style={row.length === 2 ? { display: "flex", gap: 16 } : {}}>
                  {row.map((q) => {
                    const qType = q.question_type ?? "text_short";
                    const val = answers[q.id] ?? "";
                    const isDropdown = q.display_format === "dropdown";
                    const isMulti = ["multiple_select", "multiple_select_with_other"].includes(qType);
                    const multiVals: string[] = (() => { try { return val ? JSON.parse(val) : []; } catch { return []; } })();
                    const choiceOpts = shuffledOptionsMap[q.id] ?? q.options ?? [];
                    return (
                      <div key={q.id} style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: textColor, fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
                          {q.question_text}
                          {q.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
                        </p>
                        {q.description && (
                          <p style={{ color: textColor, fontSize: 12, opacity: 0.6, margin: "0 0 8px", lineHeight: 1.4 }}><MarkdownText text={q.description} /></p>
                        )}
                        {!q.description && <div style={{ marginBottom: 8 }} />}
                        {["multiple_choice", "multiple_choice_with_other"].includes(qType) && (
                          isDropdown ? (
                            <select value={val} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} style={{ ...input, fontSize: 15 }}>
                              <option value="">— Select —</option>
                              {choiceOpts.map(o => <option key={o} value={o}>{o}</option>)}
                              {qType === "multiple_choice_with_other" && <option value="other">Other…</option>}
                            </select>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {choiceOpts.map(o => { const isSel = val === o; return <button key={o} type="button" onClick={() => setAnswers({ ...answers, [q.id]: o })} style={{ ...btn(isSel ? primaryColor : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), isSel ? btnTextColor(primaryColor) : textColor), border: `2px solid ${isSel ? primaryColor : borderColor}`, padding: "10px 14px", fontSize: 14 }}>{o}</button>; })}
                              {qType === "multiple_choice_with_other" && <button type="button" onClick={() => setAnswers({ ...answers, [q.id]: "other" })} style={{ ...btn(val === "other" ? primaryColor : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), val === "other" ? btnTextColor(primaryColor) : textColor), border: `2px solid ${borderColor}`, padding: "10px 14px", fontSize: 14 }}>Other…</button>}
                            </div>
                          )
                        )}
                        {isMulti && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {choiceOpts.map(o => { const checked = multiVals.includes(o); return <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 10, border: `2px solid ${checked ? primaryColor : borderColor}`, background: checked ? `${primaryColor}15` : "transparent" }}><input type="checkbox" checked={checked} onChange={() => { const next = checked ? multiVals.filter(v => v !== o) : [...multiVals, o]; setAnswers({ ...answers, [q.id]: JSON.stringify(next) }); }} style={{ width: 16, height: 16 }} /><span style={{ fontSize: 14, color: textColor }}>{o}</span></label>; })}
                          </div>
                        )}
                        {qType === "yes_no" && (
                          <div style={{ display: "flex", gap: 10 }}>
                            {["Yes", "No"].map(o => { const isSel = val === o; return <button key={o} type="button" onClick={() => setAnswers({ ...answers, [q.id]: o })} style={{ flex: 1, padding: "12px", borderRadius: 10, fontSize: 15, fontWeight: 700, border: `2px solid ${isSel ? primaryColor : borderColor}`, background: isSel ? `${primaryColor}20` : "transparent", color: textColor, cursor: "pointer" }}>{o}</button>; })}
                          </div>
                        )}
                        {qType === "rating" && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {Array.from({ length: parseInt(q.options?.[0] ?? "5") }, (_, i) => i + 1).map(n => { const isSel = val === String(n); return <button key={n} type="button" onClick={() => setAnswers({ ...answers, [q.id]: String(n) })} style={{ width: 40, height: 40, borderRadius: 8, fontSize: 15, fontWeight: 700, border: `2px solid ${isSel ? primaryColor : borderColor}`, background: isSel ? `${primaryColor}20` : "transparent", color: textColor, cursor: "pointer" }}>{n}</button>; })}
                          </div>
                        )}
                        {OPEN_TYPES.includes(qType) && (
                          qType === "text"
                            ? <textarea rows={3} value={val} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer…" style={{ ...input, resize: "vertical" }} />
                            : <input type={qType === "number" ? "number" : qType === "email" ? "email" : qType === "phone" ? "tel" : qType === "date" ? "date" : "text"} value={val} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder={qType === "email" ? "email@example.com" : qType === "phone" ? "(555) 555-5555" : "Your answer…"} style={input} />
                        )}
                        {qType === "product_picker" && (
                          <ProductPickerField
                            questionId={q.id}
                            products={formProducts}
                            value={val}
                            onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
                            primaryColor={primaryColor}
                            textColor={textColor}
                            borderColor={borderColor}
                            isDark={isDark}
                            input={input}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Delivery toggle */}
            {deliveryEnabled && (
              <div style={{ marginBottom: 20, padding: "16px", borderRadius: 12, border: `1px solid ${borderColor}`, background: cardBg }}>
                <p style={{ color: textColor, fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>Pickup or Delivery?</p>
                <div style={{ display: "flex", gap: 10, marginBottom: deliveryMode === "delivery" ? 14 : 0 }}>
                  {(["pickup", "delivery"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setDeliveryMode(m)}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 14, fontWeight: 700, border: `2px solid ${deliveryMode === m ? primaryColor : borderColor}`, background: deliveryMode === m ? `${primaryColor}20` : "transparent", color: textColor, cursor: "pointer", textTransform: "capitalize" }}>
                      {m}
                    </button>
                  ))}
                </div>
                {deliveryMode === "delivery" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={deliveryAddr.address_line1} onChange={(e) => setDeliveryAddr({ ...deliveryAddr, address_line1: e.target.value })} placeholder="Street address *" required style={input} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={deliveryAddr.city} onChange={(e) => setDeliveryAddr({ ...deliveryAddr, city: e.target.value })} placeholder="City" style={{ ...input, flex: 1 }} />
                      <input value={deliveryAddr.state} onChange={(e) => setDeliveryAddr({ ...deliveryAddr, state: e.target.value })} placeholder="State" style={{ ...input, width: 80, flex: "none" }} />
                      <input value={deliveryAddr.postal_code} onChange={(e) => setDeliveryAddr({ ...deliveryAddr, postal_code: e.target.value })} placeholder="ZIP" style={{ ...input, width: 90, flex: "none" }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={submitting || !allAnswered || !deliveryValid} style={btn(primaryColor)}>
              {submitting ? "Submitting…" : "Submit →"}
            </button>
          </form>
        </div>
        {footerText && <SurveyFooter text={footerText} textColor={mutedText} />}
      </div>
    );
  }

  // ── Phase: Quiz (one at a time) ──────────────────────────────────────────────
  if (phase === "quiz") {
    // Skip invisible questions
    const visibleQs = questions.filter((q) => isQuestionVisible(q, answers));
    const visibleIdx = visibleQs.findIndex((q) => q.id === currentQuestion?.id);
    const visibleTotal = visibleQs.length;

    const progress = (Object.keys(answers).length / Math.max(visibleTotal, 1)) * 100;
    const qType = currentQuestion?.question_type ?? "multiple_choice";
    const isDropdown = currentQuestion?.display_format === "dropdown";
    const currentOpts = currentQuestion
      ? (shuffledOptionsMap[currentQuestion.id] ?? currentQuestion.options ?? [])
      : [];
    const choiceOptions = isWspq
      ? wspqOptions
      : currentOpts.map(o => ({ value: o, label: o, color: primaryColor }));
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
          {displayDescription && (displayDescription.trimStart().startsWith("<")
            ? <div className="rich-text-content" style={{ color: mutedText, fontSize: 13, margin: "2px 0 8px", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: displayDescription }} />
            : <p style={{ color: mutedText, fontSize: 13, margin: "2px 0 8px", lineHeight: 1.5 }}>{displayDescription}</p>
          )}
          <div style={{ height: 4, background: borderColor, borderRadius: 2, margin: "8px 0 20px" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: primaryColor, borderRadius: 2, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: mutedText, fontSize: 13 }}>Question {Math.max(visibleIdx + 1, 1)} of {visibleTotal}</span>
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
          <p style={{ fontSize: 20, fontWeight: 600, color: textColor, lineHeight: 1.45, margin: currentQuestion?.description ? "0 0 8px" : "0 0 28px" }}>
            {currentQuestion?.question_text}
            {currentQuestion?.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
          </p>
          {currentQuestion?.description && (
            <p style={{ fontSize: 14, color: textColor, opacity: 0.65, lineHeight: 1.5, margin: "0 0 22px" }}><MarkdownText text={currentQuestion.description} /></p>
          )}

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
              {isDropdown ? (
                <select
                  multiple
                  value={multiVals}
                  onChange={(e) => setMultiVals(Array.from(e.target.selectedOptions, (o) => o.value))}
                  style={{ ...input, fontSize: 16, minHeight: 140 }}
                >
                  {currentOpts.map((o: string) => <option key={o} value={o}>{o}</option>)}
                  {qType === "multiple_select_with_other" && <option value="other">Other…</option>}
                </select>
              ) : (
                <>
                  {currentOpts.map((opt: string) => {
                    const checked = multiVals.includes(opt);
                    return (
                      <label key={opt} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "12px 16px", borderRadius: 10, border: `2px solid ${checked ? primaryColor : borderColor}`, background: checked ? `${primaryColor}15` : "transparent" }}>
                        <input type="checkbox" checked={checked} onChange={() => {
                          setMultiVals(checked ? multiVals.filter((v: string) => v !== opt) : [...multiVals, opt]);
                        }} style={{ width: 18, height: 18 }} />
                        <span style={{ fontSize: 16, color: textColor }}>{opt}</span>
                      </label>
                    );
                  })}
                  {qType === "multiple_select_with_other" && (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "12px 16px", borderRadius: 10, border: `2px solid ${multiVals.includes("other") ? primaryColor : borderColor}`, background: multiVals.includes("other") ? `${primaryColor}15` : "transparent" }}>
                        <input type="checkbox" checked={multiVals.includes("other")} onChange={() => {
                          setMultiVals(multiVals.includes("other") ? multiVals.filter((v: string) => v !== "other") : [...multiVals, "other"]);
                          if (multiVals.includes("other")) setOtherMultiText("");
                        }} style={{ width: 18, height: 18 }} />
                        <span style={{ fontSize: 16, color: textColor }}>Other…</span>
                      </label>
                      {multiVals.includes("other") && (
                        <input
                          type="text"
                          value={otherMultiText}
                          onChange={(e) => setOtherMultiText(e.target.value)}
                          placeholder="Please specify…"
                          autoFocus
                          style={{ ...input, fontSize: 15 }}
                        />
                      )}
                    </>
                  )}
                </>
              )}
              <button
                onClick={() => {
                  const val = JSON.stringify(multiVals);
                  const txt = multiVals.includes("other") && otherMultiText ? otherMultiText : undefined;
                  if (txt) setOtherTexts((prev) => ({ ...prev, [currentQuestion.id]: txt }));
                  saveAnswerNow(currentQuestion.id, val, txt);
                  selectAnswer(val);
                  setOtherMultiText("");
                }}
                style={btn(primaryColor)}
                disabled={!multiVals.length && currentQuestion?.required}
              >
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

          {visibleIdx > 0 && !isMultiSelect && !OPEN_TYPES.includes(qType) && (
            <button onClick={() => {
              // Go to previous visible question
              for (let i = current - 1; i >= 0; i--) {
                if (isQuestionVisible(questions[i], answers)) { setCurrent(i); break; }
              }
            }} style={{ ...ghostBtn, marginTop: 16 }}>
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
              <>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: textColor, margin: "0 0 8px" }}>All done!</h1>
                {postSubmitHeader && <p style={{ color: mutedText, fontSize: 14, margin: "4px 0 0", lineHeight: 1.5 }}>{postSubmitHeader}</p>}
              </>
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

          <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 24 }}>
            {hasPostSubmit ? (
              // Post-submit form inline — all questions at once
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSubmitting(true);
                try {
                  // 1. Submit post-submit (contact) form first — no stop, just person resolution
                  const psRes = await fetch("/api/survey/panel-submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ survey_id: postSubmitSurveyId, tenant_id: tenantId, answers: psAnswers, contact_id: contactId || undefined, skip_stop: true }),
                  });
                  const psData = await psRes.json().catch(() => ({}));
                  // 2. Use resolved person_id when submitting the main survey (creates the stop)
                  const resolvedPersonId: string | undefined = psData.person_id || contactId || undefined;
                  const mainResult = await submitMainSurvey(resolvedPersonId);
                  setSubmitting(false);
                  if (mainResult?.payment_required) setPhase("payment");
                  else setPhase("thankyou");
                } catch { setSubmitting(false); setPhase("thankyou"); }
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  {postSubmitQuestions!.map((psQ) => {
                    const psType = psQ.question_type ?? "text_short";
                    const psVal = psAnswers[psQ.id] ?? "";
                    const isOpen = ["text", "text_short", "number", "email", "phone", "date"].includes(psType);
                    const isChoice = ["multiple_choice", "multiple_choice_with_other", "yes_no"].includes(psType);
                    const psOptions = psQ.options ?? [];
                    const choiceList = psType === "yes_no" ? ["Yes", "No"] : psOptions;

                    return (
                      <div key={psQ.id}>
                        <p style={{ color: textColor, fontSize: 14, fontWeight: 600, margin: psQ.description ? "0 0 4px" : "0 0 8px" }}>
                          {psQ.question_text}
                          {psQ.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
                        </p>
                        {psQ.description && (
                          <p style={{ color: textColor, fontSize: 12, opacity: 0.6, margin: "0 0 8px", lineHeight: 1.4 }}><MarkdownText text={psQ.description} /></p>
                        )}
                        {isOpen && (
                          psType === "text" ? (
                            <textarea rows={2} style={{ ...input, resize: "vertical" }} placeholder="Your answer…"
                              value={psVal} onChange={e => setPsAnswers({ ...psAnswers, [psQ.id]: e.target.value })} />
                          ) : (
                            <input
                              type={psType === "number" ? "number" : psType === "email" ? "email" : psType === "phone" ? "tel" : psType === "date" ? "date" : "text"}
                              style={input}
                              placeholder={psType === "email" ? "email@example.com" : psType === "phone" ? "(555) 555-5555" : ""}
                              value={psVal}
                              onChange={e => setPsAnswers({ ...psAnswers, [psQ.id]: e.target.value })}
                            />
                          )
                        )}
                        {isChoice && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {choiceList.map((opt) => {
                              const isSel = psVal === opt;
                              return (
                                <button key={opt} type="button"
                                  onClick={() => setPsAnswers({ ...psAnswers, [psQ.id]: opt })}
                                  style={{ ...btn(isSel ? submitColor : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)"), isSel ? btnTextColor(submitColor) : textColor), border: isSel ? `2px solid ${submitColor}` : `2px solid ${borderColor}`, padding: "10px 16px", fontSize: 15 }}>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="submit" disabled={submitting} style={btn(submitColor)}>
                  {submitting ? "Saving…" : "Save my Results"}
                </button>
                {!postSubmitRequired && (
                  <button type="button" onClick={async () => { const r = await submitMainSurvey(); if (r?.payment_required) setPhase("payment"); else setPhase("thankyou"); }} style={{ ...ghostBtn, marginTop: 10 }}>
                    Skip
                  </button>
                )}
              </form>
            ) : (
              <button
                disabled={submitting}
                onClick={async () => { const r = await submitMainSurvey(); if (r?.payment_required) setPhase("payment"); else setPhase("thankyou"); }}
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

  // ── Phase: Payment ─────────────────────────────────────────────────────────
  if (phase === "payment") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px", background: bgColor }}>
        <div style={{ ...card, textAlign: "center", maxWidth: 420 }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ height: 36, marginBottom: 12, objectFit: "contain", maxWidth: 120 }} />}
          <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: textColor, margin: "0 0 8px" }}>
            Payment Required
          </h1>
          <p style={{ color: mutedText, fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
            Complete your order by submitting payment below.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {opportunityId && (
              <a
                href={`/checkout/${opportunityId}`}
                style={{ ...btn(primaryColor), textDecoration: "none" }}
              >
                Pay Now →
              </a>
            )}
            <button onClick={() => setPhase("thankyou")} style={ghostBtn}>
              Skip for now
            </button>
          </div>
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
            thankyouMessage || "Your response has been recorded."
          )}
        </p>
        {!isKiosk && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn(primaryColor), textDecoration: "none" }}>
                {learnMoreLabel || "Learn More →"}
              </a>
            )}
            {showShare && (
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
            )}
            {showTakeAgain && (
              <button onClick={resetSurvey} style={{ ...ghostBtn, marginTop: 4 }}>Take Again</button>
            )}
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

// ── Product Picker Field ───────────────────────────────────────────────────────

function ProductPickerField({
  questionId,
  products,
  value,
  onChange,
  primaryColor,
  textColor,
  borderColor,
  isDark,
  input: inputStyle,
}: {
  questionId: string;
  products: { id: string; name: string; sku: string | null }[];
  value: string;
  onChange: (v: string) => void;
  primaryColor: string;
  textColor: string;
  borderColor: string;
  isDark: boolean;
  input: React.CSSProperties;
}) {
  type Row = { key: string; product_id: string; qty: number };
  let rows: Row[] = [];
  try { rows = JSON.parse(value || "[]"); } catch { rows = []; }

  function updateRows(next: Row[]) {
    onChange(JSON.stringify(next.filter((r) => r.product_id || r.qty > 0)));
  }

  function addRow() {
    updateRows([...rows, { key: Math.random().toString(36).slice(2), product_id: "", qty: 1 }]);
  }

  function removeRow(key: string) {
    updateRows(rows.filter((r) => r.key !== key));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    updateRows(rows.map((r) => r.key === key ? { ...r, ...patch } : r));
  }

  if (products.length === 0) {
    return <div style={{ fontSize: 13, opacity: 0.5, padding: "8px 0", color: textColor }}>Loading products…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row) => (
        <div key={row.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={row.product_id}
            onChange={(e) => updateRow(row.key, { product_id: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value="">— Select product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
          </select>
          <input
            type="number"
            min={1}
            value={row.qty}
            onChange={(e) => updateRow(row.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
            style={{ ...inputStyle, width: 70, flex: "none" }}
          />
          <button type="button" onClick={() => removeRow(row.key)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.45, color: textColor, padding: "0 4px" }}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
          border: `1px solid ${borderColor}`, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          cursor: "pointer", fontSize: 14, color: textColor, width: "fit-content", fontWeight: 500,
        }}
      >
        + Add product
      </button>
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
