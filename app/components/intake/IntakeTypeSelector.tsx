"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTypeDefaults } from "@/lib/intake-templates";

type FormType = "person" | "company" | "opportunity" | "event" | "survey" | "custom";

type TypeCard = {
  type: FormType;
  icon: string;
  label: string;
  description: string;
};

const TYPE_CARDS: TypeCard[] = [
  { type: "person",      icon: "👤", label: "Contact Form",       description: "Capture contact details from individuals" },
  { type: "company",     icon: "🏢", label: "Business Contact",   description: "Capture business and partnership information" },
  { type: "opportunity", icon: "💰", label: "Order Form",         description: "Take orders and capture sales leads" },
  { type: "event",       icon: "📅", label: "Event Registration", description: "Register attendees for an event" },
  { type: "survey",      icon: "📊", label: "Survey",             description: "Collect opinions, run polls" },
  { type: "custom",      icon: "⚙️", label: "Custom",             description: "Start from scratch with full control" },
];

const SURVEY_STARTERS = [
  {
    id: "support_oppose",
    label: "Support / Oppose",
    description: "Ask where people stand on a candidate or issue — includes a support scale and comment field.",
  },
  {
    id: "top_issue",
    label: "Top Issue",
    description: "Find out what matters most — multiple choice issues, priority ranking, and open comments.",
  },
];

export default function IntakeTypeSelector() {
  const router = useRouter();
  const [selected, setSelected] = useState<FormType | null>(null);
  const [creating, setCreating] = useState(false);
  const [hoveredType, setHoveredType] = useState<FormType | null>(null);
  const [hoveredStarter, setHoveredStarter] = useState<string | null>(null);

  async function createAndNavigate(type: FormType, starter?: string) {
    setCreating(true);
    try {
      const defaultTitles: Record<FormType, string> = {
        person:      "Contact Form",
        company:     "Business Contact",
        opportunity: "Order Form",
        event:       "Event Registration",
        survey:      starter === "top_issue" ? "Top Issue Survey" : starter === "support_oppose" ? "Support / Oppose Survey" : "Survey",
        custom:      "New Form",
      };

      // Opportunity forms get opp_trigger pre-enabled
      const opp_trigger = type === "opportunity"
        ? { enabled: true, mode: "always" }
        : null;

      const defaults = getTypeDefaults(type as any, starter);
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: defaultTitles[type],
          form_type: type,
          status: "draft",
          opp_trigger,
          questions: defaults,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const { survey_id } = await res.json();

      router.push(`/crm/intake/${survey_id}/edit`);
    } catch {
      setCreating(false);
    }
  }

  function handleCardClick(type: FormType) {
    if (creating) return;
    if (type === "survey") {
      setSelected("survey");
    } else {
      createAndNavigate(type);
    }
  }

  // ── Survey starter step ───────────────────────────────────────────────────
  if (selected === "survey") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <button
          onClick={() => setSelected(null)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "var(--gg-text-dim, #6b7280)",
            background: "none", border: "none", cursor: "pointer",
            padding: "4px 0", marginBottom: 32,
          }}
        >
          ← Back
        </button>

        <div style={{ marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Choose a starter</h2>
          <p style={{ margin: 0, opacity: 0.55, fontSize: 14 }}>
            Pick a template to start with — you can edit all questions freely.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          {SURVEY_STARTERS.map((starter) => {
            const hovered = hoveredStarter === starter.id;
            return (
              <button
                key={starter.id}
                onClick={() => !creating && createAndNavigate("survey", starter.id)}
                onMouseEnter={() => setHoveredStarter(starter.id)}
                onMouseLeave={() => setHoveredStarter(null)}
                disabled={creating}
                style={{
                  textAlign: "left",
                  padding: "24px 20px",
                  borderRadius: 12,
                  background: hovered
                    ? "rgba(var(--accent-500-raw, 99 102 241), 0.06)"
                    : "rgb(var(--card-700, 30 30 40))",
                  border: hovered
                    ? "1px solid rgba(var(--accent-500-raw, 99 102 241), 0.5)"
                    : "1px solid rgb(var(--border-600, 55 55 70))",
                  boxShadow: hovered
                    ? "0 8px 32px rgba(var(--accent-500-raw, 99 102 241), 0.12)"
                    : "0 2px 8px rgba(0,0,0,0.25)",
                  cursor: creating ? "not-allowed" : "pointer",
                  transform: hovered ? "translateY(-2px)" : "none",
                  transition: "all 150ms ease",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{starter.label}</div>
                <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.5 }}>{starter.description}</div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => !creating && createAndNavigate("survey")}
          disabled={creating}
          style={{
            width: "100%", padding: "14px 20px", borderRadius: 10,
            background: "none",
            border: "1px dashed rgb(var(--border-600, 55 55 70))",
            color: "inherit", cursor: creating ? "not-allowed" : "pointer",
            fontSize: 14, opacity: creating ? 0.5 : 0.65,
            transition: "opacity 150ms",
          }}
        >
          Start blank — no questions
        </button>
      </div>
    );
  }

  // ── Main type grid ────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em" }}>
          New Intake
        </h1>
        <p style={{ margin: 0, opacity: 0.5, fontSize: 15 }}>Choose a starting point</p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 16,
      }}>
        {TYPE_CARDS.map(({ type, icon, label, description }) => {
          const hovered = hoveredType === type;
          return (
            <button
              key={type}
              onClick={() => handleCardClick(type)}
              onMouseEnter={() => setHoveredType(type)}
              onMouseLeave={() => setHoveredType(null)}
              disabled={creating}
              style={{
                textAlign: "left",
                padding: "28px 24px",
                borderRadius: 12,
                background: hovered
                  ? "rgba(var(--accent-500-raw, 99 102 241), 0.04)"
                  : "rgb(var(--card-700, 30 30 40))",
                border: hovered
                  ? "1px solid rgba(var(--accent-500-raw, 99 102 241), 0.55)"
                  : "1px solid rgb(var(--border-600, 55 55 70))",
                boxShadow: hovered
                  ? "0 8px 32px rgba(var(--accent-500-raw, 99 102 241), 0.13)"
                  : "0 2px 8px rgba(0,0,0,0.28)",
                cursor: creating ? "not-allowed" : "pointer",
                transform: hovered ? "translateY(-2px)" : "none",
                transition: "all 150ms ease",
                opacity: creating ? 0.6 : 1,
              }}
            >
              <div style={{
                fontSize: 36,
                marginBottom: 14,
                filter: hovered
                  ? "brightness(1.2)"
                  : "brightness(0.85) saturate(0.8)",
                transition: "filter 150ms ease",
              }}>
                {icon}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 13, opacity: 0.55, lineHeight: 1.5 }}>{description}</div>
            </button>
          );
        })}
      </div>

      {creating && (
        <p style={{ textAlign: "center", marginTop: 32, opacity: 0.5, fontSize: 13 }}>
          Creating…
        </p>
      )}
    </div>
  );
}
