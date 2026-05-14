import Link from "next/link";
import { Plus } from "lucide-react";
import { getSurveys } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";
import type { FormType, SurveyStatus } from "@/lib/db/supabase-surveys";
import LoadTemplatesButton from "@/app/components/intake/LoadTemplatesButton";
import IntakeRowActions from "@/app/components/intake/IntakeRowActions";

// ── Badge helpers ─────────────────────────────────────────────────────────────

const TYPE_META: Record<FormType, { label: string; color: string; bg: string }> = {
  person:      { label: "Contact Form",       color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  company:     { label: "Business Contact",   color: "#0d9488", bg: "rgba(13,148,136,0.12)" },
  opportunity: { label: "Order Form",         color: "#16a34a", bg: "rgba(22,163,74,0.12)"  },
  event:       { label: "Event",              color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  survey:      { label: "Survey",             color: "#d97706", bg: "rgba(217,119,6,0.12)"  },
  custom:      { label: "Custom",             color: "#6b7280", bg: "rgba(107,114,128,0.12)"},
  wspq:        { label: "Political Quiz",     color: "#d97706", bg: "rgba(217,119,6,0.12)"  },
};

const STATUS_META: Record<SurveyStatus, { label: string; color: string; bg: string; dot: string }> = {
  draft:  { label: "Draft",  color: "#6b7280", bg: "rgba(107,114,128,0.12)", dot: "#6b7280" },
  live:   { label: "Live",   color: "#16a34a", bg: "rgba(22,163,74,0.12)",   dot: "#16a34a" },
  closed: { label: "Closed", color: "#ef4444", bg: "rgba(239,68,68,0.10)",   dot: "#ef4444" },
};

function TypeBadge({ type }: { type: FormType }) {
  const m = TYPE_META[type] ?? TYPE_META.custom;
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 9px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: m.bg,
      color: m.color,
      whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: SurveyStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 9px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: m.bg,
      color: m.color,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IntakePage() {
  const tenant = await getTenant();
  const surveys = await getSurveys(tenant.id);

  const isEmpty = surveys.length === 0;

  return (
    <section className="stack">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Intake</h1>
          <p style={{ margin: "4px 0 0", color: "var(--gg-dim, rgb(134 150 168))", fontSize: 14 }}>
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
          background: "var(--gg-card, white)",
          borderRadius: 12, padding: "56px 48px",
          textAlign: "center",
          border: "1px solid var(--gg-border, #e5e7eb)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>No forms yet</h3>
          <p style={{ opacity: 0.55, margin: "0 0 24px" }}>
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
          background: "var(--gg-card, white)",
          borderRadius: 12,
          border: "1px solid var(--gg-border, #e5e7eb)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)",
          overflow: "hidden",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 130px 90px 80px 100px 220px",
            padding: "10px 20px",
            borderBottom: "1px solid var(--gg-border, #e5e7eb)",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--gg-dim, rgb(134 150 168))",
            gap: 12,
          }}>
            <span>Name</span>
            <span>Type</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Responses</span>
            <span style={{ textAlign: "right" }}>Updated</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>

          {/* Rows */}
          {surveys.map((survey, i) => {
            const formType = (survey.form_type as FormType) ?? "custom";
            const status = (survey.status as SurveyStatus) ?? "live";
            const isLast = i === surveys.length - 1;

            return (
              <div
                key={survey.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 130px 90px 80px 100px 220px",
                  padding: "14px 20px",
                  borderBottom: isLast ? "none" : "1px solid var(--gg-border, #e5e7eb)",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {/* Name */}
                <div>
                  <Link
                    href={`/crm/intake/${survey.id}/edit`}
                    style={{ fontWeight: 600, fontSize: 14, textDecoration: "none", color: "inherit" }}
                  >
                    {survey.title}
                  </Link>
                  {survey.description && (
                    <div style={{ fontSize: 12, color: "var(--gg-dim, rgb(134 150 168))", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {survey.description}
                    </div>
                  )}
                </div>

                {/* Type */}
                <div><TypeBadge type={formType} /></div>

                {/* Status */}
                <div><StatusBadge status={status} /></div>

                {/* Responses */}
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {survey.total_responses.toLocaleString()}
                </div>

                {/* Updated */}
                <div style={{ textAlign: "right", fontSize: 12, color: "var(--gg-dim, rgb(134 150 168))" }}>
                  {relTime(survey.updated_at)}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <Link
                    href={`/crm/intake/${survey.id}/edit`}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 10px",
                      borderRadius: 6, textDecoration: "none",
                      border: "1px solid var(--gg-border, #e5e7eb)",
                      color: "inherit",
                    }}
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/crm/intake/${survey.id}/results`}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 10px",
                      borderRadius: 6, textDecoration: "none",
                      background: "var(--gg-primary, #2563eb)", color: "white",
                    }}
                  >
                    Results
                  </Link>
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
