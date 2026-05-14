"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTypeDefaults } from "@/lib/intake-templates";

type FormType = "person" | "company" | "opportunity" | "event" | "survey" | "custom";

const TYPE_CARDS: { type: FormType; icon: string; label: string; description: string }[] = [
  { type: "person",      icon: "👤", label: "Contact Form",       description: "Capture contact details from individuals" },
  { type: "company",     icon: "🏢", label: "Business Contact",   description: "Capture business and partnership information" },
  { type: "opportunity", icon: "💰", label: "Order Form",         description: "Take orders and capture sales leads" },
  { type: "event",       icon: "📅", label: "Event Registration", description: "Register attendees for an event" },
  { type: "survey",      icon: "📊", label: "Survey",             description: "Collect opinions, run polls" },
  { type: "custom",      icon: "⚙️", label: "Custom",             description: "Start from scratch with full control" },
];

const SURVEY_STARTERS = [
  { id: "support_oppose", label: "Support / Oppose", description: "Ask where people stand on a candidate or issue — includes a support scale and comment field." },
  { id: "top_issue",      label: "Top Issue",        description: "Find out what matters most — multiple choice issues, priority ranking, and open comments." },
];

const CSS = `
  .gg-type-card {
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .gg-type-card:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(37,99,235,0.6) !important;
    box-shadow: 0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1) !important;
  }
  .gg-type-card:hover:not(:disabled) .gg-type-icon {
    background: rgba(37,99,235,0.22) !important;
    border-color: rgba(37,99,235,0.4) !important;
  }
  .gg-type-card:active:not(:disabled) { transform: translateY(0); }
  .gg-type-blank:hover:not(:disabled) {
    border-color: var(--gg-border, rgb(52 64 84)) !important;
    color: rgb(var(--text-100)) !important;
  }
`;

const cardStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "28px 24px",
  borderRadius: 12,
  background: "var(--gg-card)",
  border: "1px solid var(--gg-border)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)",
  cursor: "pointer",
};

export default function IntakeTypeSelector() {
  const router = useRouter();
  const [selected, setSelected] = useState<FormType | null>(null);
  const [creating, setCreating] = useState(false);

  async function createAndNavigate(type: FormType, starter?: string) {
    setCreating(true);
    try {
      const defaultTitles: Record<FormType, string> = {
        person: "Contact Form", company: "Business Contact", opportunity: "Order Form",
        event: "Event Registration",
        survey: starter === "top_issue" ? "Top Issue Survey" : starter === "support_oppose" ? "Support / Oppose Survey" : "Survey",
        custom: "New Form",
      };
      const opp_trigger = type === "opportunity" ? { enabled: true, mode: "always" } : null;
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: defaultTitles[type], form_type: type, status: "draft", opp_trigger, questions: getTypeDefaults(type, starter) }),
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
    if (type === "survey") setSelected("survey");
    else createAndNavigate(type);
  }

  // ── Survey starter step ────────────────────────────────────────────────────
  if (selected === "survey") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <style>{CSS}</style>

        <button
          onClick={() => setSelected(null)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--gg-dim)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 32 }}
        >
          ← Back
        </button>

        <div style={{ marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Choose a starter</h2>
          <p style={{ margin: 0, color: "var(--gg-dim)", fontSize: 14 }}>
            Pick a template to start with — you can edit all questions freely.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {SURVEY_STARTERS.map((starter) => (
            <button
              key={starter.id}
              className="gg-type-card"
              onClick={() => !creating && createAndNavigate("survey", starter.id)}
              disabled={creating}
              style={{ ...cardStyle, opacity: creating ? 0.5 : 1 }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "rgb(var(--text-100))" }}>
                {starter.label}
              </div>
              <div style={{ fontSize: 13, color: "var(--gg-dim)", lineHeight: 1.55 }}>
                {starter.description}
              </div>
            </button>
          ))}
        </div>

        <button
          className="gg-type-blank"
          onClick={() => !creating && createAndNavigate("survey")}
          disabled={creating}
          style={{
            width: "100%", padding: "14px 20px", borderRadius: 10,
            background: "none", border: "1px dashed var(--gg-border)",
            color: "var(--gg-dim)", cursor: creating ? "not-allowed" : "pointer",
            fontSize: 14, transition: "color 0.15s, border-color 0.15s",
          }}
        >
          Start blank — no questions
        </button>
      </div>
    );
  }

  // ── Main type grid ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <style>{CSS}</style>

      <div style={{ marginBottom: 40 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em" }}>
          New Intake
        </h1>
        <p style={{ margin: 0, color: "var(--gg-dim)", fontSize: 15 }}>Choose a starting point</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {TYPE_CARDS.map(({ type, icon, label, description }) => (
          <button
            key={type}
            className="gg-type-card"
            onClick={() => handleCardClick(type)}
            disabled={creating}
            style={{ ...cardStyle, opacity: creating ? 0.5 : 1 }}
          >
            <div
              className="gg-type-icon"
              style={{
                width: 52, height: 52, borderRadius: 14, marginBottom: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26,
                background: "rgba(37,99,235,0.12)",
                border: "1px solid rgba(37,99,235,0.22)",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
            >
              {icon}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: "rgb(var(--text-100))" }}>
              {label}
            </div>
            <div style={{ fontSize: 13, color: "var(--gg-dim)", lineHeight: 1.55 }}>
              {description}
            </div>
          </button>
        ))}
      </div>

      {creating && (
        <p style={{ textAlign: "center", marginTop: 32, color: "var(--gg-dim)", fontSize: 13 }}>
          Creating…
        </p>
      )}
    </div>
  );
}
