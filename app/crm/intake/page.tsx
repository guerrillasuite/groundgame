import Link from "next/link";
import { Plus } from "lucide-react";
import { getSurveys } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";
import type { FormType, SurveyStatus } from "@/lib/db/supabase-surveys";
import LoadTemplatesButton from "@/app/components/intake/LoadTemplatesButton";
import IntakeRowActions from "@/app/components/intake/IntakeRowActions";

// ── Design tokens ─────────────────────────────────────────────────────────────

const CSS = `
  .gg-intake-row { transition: background 0.12s ease; cursor: default; }
  .gg-intake-row:hover { background: rgba(255,255,255,0.028) !important; }
  .gg-intake-name { transition: color 0.12s ease; text-decoration: none; color: inherit; font-weight: 600; font-size: 14px; }
  .gg-intake-row:hover .gg-intake-name { color: #60a5fa; }
  .gg-row-btn { transition: border-color 0.12s, background 0.12s; }
  .gg-row-btn:hover { border-color: rgba(255,255,255,0.22) !important; background: rgba(255,255,255,0.04) !important; }
  .gg-row-btn-primary { transition: opacity 0.12s; }
  .gg-row-btn-primary:hover { opacity: 0.82 !important; }
  .gg-row-btn-danger { transition: border-color 0.12s, background 0.12s; }
  .gg-row-btn-danger:hover { background: rgba(248,113,113,0.08) !important; border-color: rgba(248,113,113,0.45) !important; }
  @keyframes gg-live-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.55); }
    55%       { box-shadow: 0 0 0 5px rgba(22,163,74,0); }
  }
  .gg-live-dot { animation: gg-live-pulse 2.2s ease-out infinite; }
`;

// ── Badge helpers ─────────────────────────────────────────────────────────────

const TYPE_META: Record<FormType, { label: string; color: string; bg: string }> = {
  person:      { label: "Contact Form",     color: "#60a5fa", bg: "rgba(59,130,246,0.12)"  },
  company:     { label: "Biz Contact",      color: "#2dd4bf", bg: "rgba(13,148,136,0.12)"  },
  opportunity: { label: "Order Form",       color: "#4ade80", bg: "rgba(22,163,74,0.12)"   },
  event:       { label: "Event",            color: "#a78bfa", bg: "rgba(139,92,246,0.12)"  },
  survey:      { label: "Survey",           color: "#fbbf24", bg: "rgba(217,119,6,0.12)"   },
  custom:      { label: "Custom",           color: "#94a3b8", bg: "rgba(107,114,128,0.12)" },
  wspq:        { label: "Political Quiz",   color: "#fbbf24", bg: "rgba(217,119,6,0.12)"   },
};

const STATUS_META: Record<SurveyStatus, { label: string; color: string; bg: string; dot: string }> = {
  draft:  { label: "Draft",  color: "#94a3b8", bg: "rgba(107,114,128,0.12)", dot: "#94a3b8" },
  live:   { label: "Live",   color: "#4ade80", bg: "rgba(22,163,74,0.12)",   dot: "#4ade80" },
  closed: { label: "Closed", color: "#f87171", bg: "rgba(239,68,68,0.10)",   dot: "#f87171" },
};

function TypeBadge({ type }: { type: FormType }) {
  const m = TYPE_META[type] ?? TYPE_META.custom;
  return (
    <span style={{
      display: "inline-block", padding: "3px 8px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: SurveyStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  const isLive = status === "live";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: "nowrap",
    }}>
      <span
        className={isLive ? "gg-live-dot" : undefined}
        style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }}
      />
      {m.label}
    </span>
  );
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Grid layout ───────────────────────────────────────────────────────────────
// Name (flex) | Type | Status | Responses | Updated | Actions
const GRID = "minmax(0,1fr) 114px 90px 60px 80px 330px";
const GRID_GAP = 14;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IntakePage() {
  const tenant = await getTenant();
  const surveys = await getSurveys(tenant.id);
  const isEmpty = surveys.length === 0;

  return (
    <section className="stack">
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Intake</h1>
          <p style={{ margin: "4px 0 0", color: "var(--gg-dim)", fontSize: 14 }}>
            Forms, surveys, and data collection
          </p>
        </div>
        <Link
          href="/crm/intake/new"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 18px",
            background: "var(--gg-primary, #2563eb)",
            color: "white", borderRadius: 8, fontWeight: 600,
            textDecoration: "none", fontSize: 14, whiteSpace: "nowrap",
          }}
        >
          <Plus size={15} /> New Intake
        </Link>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div style={{
          background: "var(--gg-card)",
          borderRadius: 14, padding: "56px 48px",
          textAlign: "center",
          border: "1px solid var(--gg-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>📋</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>No forms yet</h3>
          <p style={{ color: "var(--gg-dim)", margin: "0 0 24px", fontSize: 14 }}>
            Create your first intake form to start collecting responses.
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/crm/intake/new"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 20px",
                background: "var(--gg-primary, #2563eb)",
                color: "white", borderRadius: 8, fontWeight: 600, textDecoration: "none",
              }}
            >
              <Plus size={15} /> Create first form
            </Link>
            <LoadTemplatesButton />
          </div>
        </div>
      )}

      {/* Table */}
      {!isEmpty && (
        <div style={{
          background: "var(--gg-card)",
          borderRadius: 14,
          border: "1px solid var(--gg-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
          overflow: "hidden",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: GRID,
            padding: "10px 18px",
            borderBottom: "1px solid var(--gg-border)",
            background: "rgba(255,255,255,0.025)",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--gg-dim)",
            gap: GRID_GAP,
            alignItems: "center",
          }}>
            <span>Name</span>
            <span>Type</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Resp.</span>
            <span style={{ textAlign: "right" }}>Updated</span>
            <span>Actions</span>
          </div>

          {/* Rows */}
          {surveys.map((survey, i) => {
            const formType = (survey.form_type as FormType) ?? "custom";
            const status = (survey.status as SurveyStatus) ?? "live";
            const isLast = i === surveys.length - 1;

            return (
              <div
                key={survey.id}
                className="gg-intake-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  padding: "13px 18px",
                  borderBottom: isLast ? "none" : "1px solid var(--gg-border)",
                  alignItems: "center",
                  gap: GRID_GAP,
                }}
              >
                {/* Name */}
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/crm/intake/${survey.id}/edit`}
                    className="gg-intake-name"
                  >
                    {survey.title}
                  </Link>
                  {survey.description && (
                    <div style={{
                      fontSize: 12, color: "var(--gg-dim)", marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {survey.description}
                    </div>
                  )}
                </div>

                {/* Type */}
                <div><TypeBadge type={formType} /></div>

                {/* Status */}
                <div><StatusBadge status={status} /></div>

                {/* Responses */}
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "rgb(var(--text-100))" }}>
                  {survey.total_responses.toLocaleString()}
                </div>

                {/* Updated */}
                <div style={{ textAlign: "right", fontSize: 12, color: "var(--gg-dim)", whiteSpace: "nowrap" }}>
                  {relTime(survey.updated_at)}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "nowrap" }}>
                  <IntakeRowActions surveyId={survey.id} surveyTitle={survey.title} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
