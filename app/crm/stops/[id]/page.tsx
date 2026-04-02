// app/crm/stops/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function sbHeaders() {
  return {
    Authorization: `Bearer ${SB_KEY()}`,
    apikey: SB_KEY(),
    "Content-Type": "application/json",
  };
}

function formatLocalDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function formatDuration(sec: number | null | undefined) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const CHANNEL_COLORS: Record<string, { bg: string; color: string }> = {
  quiz:   { bg: "rgba(234,179,8,0.12)",  color: "#b45309" },
  doors:  { bg: "rgba(59,130,246,0.1)",  color: "#2563eb" },
  call:   { bg: "rgba(34,197,94,0.1)",   color: "#16a34a" },
  text:   { bg: "rgba(168,85,247,0.1)",  color: "#7c3aed" },
  survey: { bg: "rgba(20,184,166,0.1)",  color: "#0f766e" },
  street: { bg: "rgba(249,115,22,0.1)",  color: "#c2410c" },
  table:  { bg: "rgba(236,72,153,0.1)",  color: "#be185d" },
};

const RESULT_COLORS: Record<string, string> = {
  libertarian:   "#eab308",
  progressive:   "#3b82f6",
  conservative:  "#ef4444",
  authoritarian: "#475569",
  moderate:      "#8b5cf6",
  contact_made:  "#22c55e",
  connected:     "#22c55e",
  follow_up:     "#f59e0b",
  not_home:      "#6b7280",
  refused:       "#ef4444",
};

const NOLAN_LABELS: Record<string, string> = {
  libertarian:   "Libertarian",
  progressive:   "Progressive",
  conservative:  "Conservative",
  authoritarian: "Authoritarian",
  moderate:      "Moderate",
};

type Params = { params: Promise<{ id: string }> };

export default async function StopDetail({ params }: Params) {
  const tenant = await getTenant();
  if (!hasFeature(tenant.features, "crm_stops")) redirect("/crm");

  const { id: stopId } = await params;
  const sb = makeSb(tenant.id);

  // 1. Fetch stop
  const { data: stop } = await sb
    .from("stops")
    .select("id, stop_at, channel, result, notes, duration_sec, person_id, user_id, walklist_id, household_id, opportunity_id")
    .eq("id", stopId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!stop) {
    return (
      <section style={{ padding: 24 }}>
        <Link href="/crm/stops" style={{ fontSize: 13, opacity: 0.6, textDecoration: "none" }}>← Stops</Link>
        <p style={{ marginTop: 16, opacity: 0.6 }}>Stop not found.</p>
      </section>
    );
  }

  // 2. Parallel fetches
  const [personRes, walklistRes, householdRes, opportunityRes] = await Promise.all([
    (stop as any).person_id
      ? sb.from("people").select("id, first_name, last_name, email, phone, nolan_personal_score, nolan_economic_score").eq("id", (stop as any).person_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (stop as any).walklist_id
      ? sb.from("walklists").select("id, name").eq("id", (stop as any).walklist_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (stop as any).household_id
      ? sb.from("households").select("id, name, location_id").eq("id", (stop as any).household_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (stop as any).opportunity_id
      ? sb.from("opportunities").select("id, title, stage").eq("id", (stop as any).opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const person = personRes.data as any;
  const walklist = walklistRes.data as any;
  const household = householdRes.data as any;
  const opportunity = opportunityRes.data as any;

  // 3. Location from household
  let location: any = null;
  if (household?.location_id) {
    const { data: loc } = await sb
      .from("locations")
      .select("address_line1, city, state, postal_code")
      .eq("id", household.location_id)
      .maybeSingle();
    location = loc;
  }

  // 4. Canvasser display name
  let canvasserName: string | null = null;
  if ((stop as any).user_id) {
    try {
      const r = await fetch(`${SB_URL()}/auth/v1/admin/users/${(stop as any).user_id}`, { headers: sbHeaders() });
      if (r.ok) {
        const au = await r.json();
        canvasserName = au.user_metadata?.name || au.user_metadata?.full_name || au.email || null;
      }
    } catch { /* non-fatal */ }
  }

  // 5. Survey responses for this person (all surveys)
  type SurveySection = {
    surveyId: string;
    surveyTitle: string;
    qa: { questionText: string; answerValue: string; orderIndex: number }[];
  };
  const surveySections: SurveySection[] = [];

  if ((stop as any).person_id) {
    const { data: responses } = await sb
      .from("responses")
      .select("survey_id, question_id, answer_value")
      .eq("crm_contact_id", (stop as any).person_id);

    if (responses && responses.length > 0) {
      const surveyIds = [...new Set((responses as any[]).map((r) => r.survey_id as string))];
      const questionIds = [...new Set((responses as any[]).map((r) => r.question_id as string))];

      const [surveysRes, questionsRes] = await Promise.all([
        sb.from("surveys").select("id, title").in("id", surveyIds),
        sb.from("questions").select("id, question_text, order_index").in("id", questionIds),
      ]);

      const surveyTitleMap = new Map(
        ((surveysRes.data ?? []) as any[]).map((s) => [s.id, s.title as string])
      );
      const questionMap = new Map(
        ((questionsRes.data ?? []) as any[]).map((q) => [q.id, { text: q.question_text as string, order: q.order_index as number }])
      );

      for (const sid of surveyIds) {
        const sectionResponses = (responses as any[]).filter((r) => r.survey_id === sid);
        const qa = sectionResponses
          .map((r) => {
            const q = questionMap.get(r.question_id);
            return {
              questionText: q?.text ?? r.question_id,
              answerValue: r.answer_value as string,
              orderIndex: q?.order ?? 999,
            };
          })
          .sort((a, b) => a.orderIndex - b.orderIndex);

        surveySections.push({
          surveyId: sid,
          surveyTitle: surveyTitleMap.get(sid) ?? sid,
          qa,
        });
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const s = stop as any;
  const channelStyle = CHANNEL_COLORS[s.channel ?? ""] ?? { bg: "rgba(0,0,0,0.06)", color: "inherit" };
  const resultColor = RESULT_COLORS[s.result ?? ""] ?? "#6b7280";
  const duration = formatDuration(s.duration_sec);
  const personName = person ? [person.first_name, person.last_name].filter(Boolean).join(" ") || "—" : null;
  const addressParts = location
    ? [location.address_line1, location.city, location.state, location.postal_code].filter(Boolean)
    : [];

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,.03)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 10,
    padding: "16px 18px",
  };

  const sectionLabel: React.CSSProperties = {
    fontWeight: 700,
    fontSize: 11,
    marginBottom: 8,
    opacity: 0.55,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  };

  return (
    <section style={{ padding: "16px 20px", maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/crm/stops" style={{ fontSize: 13, opacity: 0.5, textDecoration: "none", whiteSpace: "nowrap" }}>
          ← Stops
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{formatLocalDate(s.stop_at)}</h1>
            <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: channelStyle.bg, color: channelStyle.color, textTransform: "capitalize" }}>
              {s.channel ?? "unknown"}
            </span>
            {s.result && (
              <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${resultColor}18`, color: resultColor, border: `1px solid ${resultColor}33`, textTransform: "capitalize" }}>
                {s.result.replace(/_/g, " ")}
              </span>
            )}
            {duration && <span style={{ fontSize: 12, opacity: 0.5 }}>{duration}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>

        {/* Contact */}
        {person && (
          <div style={card}>
            <div style={sectionLabel}>Contact</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link href={`/crm/people/${person.id}`} style={{ fontWeight: 700, fontSize: 16, textDecoration: "none", color: "var(--gg-primary, #2563eb)" }}>
                {personName}
              </Link>
              {person.phone && <span style={{ fontSize: 13, opacity: 0.7 }}>{person.phone}</span>}
              {person.email && <span style={{ fontSize: 13, opacity: 0.7 }}>{person.email}</span>}
            </div>
          </div>
        )}

        {/* Canvasser */}
        {canvasserName && (
          <div style={card}>
            <div style={sectionLabel}>Canvasser</div>
            <span style={{ fontSize: 14 }}>{canvasserName}</span>
          </div>
        )}

        {/* Location */}
        {addressParts.length > 0 && (
          <div style={card}>
            <div style={sectionLabel}>Location</div>
            <span style={{ fontSize: 14 }}>{addressParts.join(", ")}</span>
          </div>
        )}

        {/* Walklist + Opportunity */}
        {(walklist || opportunity) && (
          <div style={{ display: "grid", gridTemplateColumns: walklist && opportunity ? "1fr 1fr" : "1fr", gap: 12 }}>
            {walklist && (
              <div style={card}>
                <div style={sectionLabel}>Walklist</div>
                <Link href={`/crm/lists/${walklist.id}`} style={{ fontSize: 14, fontWeight: 600, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>
                  {walklist.name}
                </Link>
              </div>
            )}
            {opportunity && (
              <div style={card}>
                <div style={sectionLabel}>Opportunity</div>
                <Link href={`/crm/opportunities/${opportunity.id}`} style={{ fontSize: 14, fontWeight: 600, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>
                  {opportunity.title}
                </Link>
                {opportunity.stage && (
                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6, textTransform: "capitalize" }}>{opportunity.stage}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {s.notes && (
          <div style={card}>
            <div style={sectionLabel}>Notes</div>
            <p style={{ fontSize: 14, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{s.notes}</p>
          </div>
        )}

        {/* Nolan Scores (quiz channel) */}
        {s.channel === "quiz" && person && (person.nolan_personal_score != null || person.nolan_economic_score != null) && (
          <div style={card}>
            <div style={sectionLabel}>Nolan Chart Scores</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {person.nolan_personal_score != null && (
                <div style={{ background: "rgba(59,130,246,0.1)", borderRadius: 8, padding: "12px 20px", textAlign: "center", minWidth: 100 }}>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Personal Freedom</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{person.nolan_personal_score}</div>
                  <div style={{ fontSize: 11, opacity: 0.4 }}>/ 100</div>
                </div>
              )}
              {person.nolan_economic_score != null && (
                <div style={{ background: "rgba(234,179,8,0.1)", borderRadius: 8, padding: "12px 20px", textAlign: "center", minWidth: 100 }}>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Economic Freedom</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{person.nolan_economic_score}</div>
                  <div style={{ fontSize: 11, opacity: 0.4 }}>/ 100</div>
                </div>
              )}
              {s.result && NOLAN_LABELS[s.result] && (
                <span style={{ padding: "6px 16px", borderRadius: 20, fontSize: 14, fontWeight: 700, background: `${resultColor}18`, color: resultColor, border: `1px solid ${resultColor}33` }}>
                  {NOLAN_LABELS[s.result]}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Survey Q&A — all surveys for this person */}
        {surveySections.map((section) => (
          <div key={section.surveyId} style={card}>
            <div style={sectionLabel}>Survey: {section.surveyTitle}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {section.qa.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "8px 0", opacity: 0.8, width: "70%" }}>{item.questionText}</td>
                    <td style={{ padding: "8px 0 8px 12px", fontWeight: 600, textTransform: "capitalize", textAlign: "right" }}>
                      {item.answerValue.replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      </div>
    </section>
  );
}
