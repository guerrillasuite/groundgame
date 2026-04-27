"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StepDetails, { type DetailsData } from "./StepDetails";
import StepAudience, { type AudienceData } from "./StepAudience";
import StepDesign, { type DesignData } from "./StepDesign";
import StepReview from "./StepReview";

export type DispatchDomain = {
  domain: string;
  verified: boolean;
};

type Walklist = {
  id: string;
  name: string | null;
  mode: string | null;
  total_targets: number;
};

interface Props {
  // Existing campaign data (when editing a draft)
  campaignId?: string;
  initialDetails?: Partial<DetailsData>;
  initialAudience?: Partial<AudienceData>;
  initialDesign?: object | null;
  initialHtml?: string;
  initialStep?: number;
  initialAudienceCount?: number | null;
  // Server-fetched data
  domains: DispatchDomain[];
  walklists: Walklist[];
}

const STEPS = ["Details", "Audience", "Design", "Review"];
const STEP_SLUGS = ["details", "audience", "design", "review"];

const stepIndicatorStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 14px",
  borderRadius: 20,
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: active
    ? "rgb(var(--primary-600))"
    : done
    ? "rgba(34,197,94,0.12)"
    : "rgb(var(--card-700))",
  color: active ? "white" : done ? "#16a34a" : "rgb(var(--text-300))",
  border: active ? "none" : `1px solid ${done ? "rgba(34,197,94,0.3)" : "rgb(var(--border-600))"}`,
});

const DEFAULT_DOMAIN = "groundgame.digital";

export default function ComposeFlow({
  campaignId: initialCampaignId,
  initialDetails,
  initialAudience,
  initialDesign,
  initialHtml,
  initialStep,
  initialAudienceCount,
  domains,
  walklists,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(initialCampaignId ? (initialStep ?? 0) : 0);
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId ?? null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step data
  const [details, setDetails] = useState<DetailsData>({
    name: initialDetails?.name ?? "",
    subject: initialDetails?.subject ?? "",
    preview_text: initialDetails?.preview_text ?? "",
    from_name: initialDetails?.from_name ?? "",
    from_local: initialDetails?.from_local ?? "",
    from_domain:
      initialDetails?.from_domain ??
      (domains.find((d) => d.verified)?.domain ?? DEFAULT_DOMAIN),
    reply_to: initialDetails?.reply_to ?? "",
  });

  const [audience, setAudience] = useState<AudienceData>({
    audience_type: initialAudience?.audience_type ?? "segment",
    audience_list_id: initialAudience?.audience_list_id ?? null,
    audience_segment_filters: initialAudience?.audience_segment_filters ?? null,
    audience_person_ids: (initialAudience as any)?.audience_person_ids ?? null,
  });

  const [design, setDesign] = useState<DesignData>({
    design_json: initialDesign ?? {},
    html_body: initialHtml ?? "",
  });

  const [audienceCount, setAudienceCount] = useState<number | null>(initialAudienceCount ?? null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const patchDetails = useCallback((patch: Partial<DetailsData>) => {
    setDetails((d) => ({ ...d, ...patch }));
  }, []);

  const patchAudience = useCallback((patch: Partial<AudienceData>) => {
    setAudience((a) => ({ ...a, ...patch }));
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────

  function validateStep0(): string | null {
    if (!details.name.trim()) return "Campaign name is required.";
    if (!details.subject.trim()) return "Subject line is required.";
    if (!details.from_name.trim()) return "From name is required.";
    if (!details.from_local.trim()) return "From email is required.";
    if (!details.from_domain) return "Sending domain is required.";
    return null;
  }

  function validateStep1(): string | null {
    if (audience.audience_type === "list" && !audience.audience_list_id) {
      return "Please select a list.";
    }
    if (audience.audience_type === "manual" && (!audience.audience_person_ids || audience.audience_person_ids.length === 0)) {
      return "No people selected. Use Preview & Select to choose recipients.";
    }
    return null;
  }

  // ── URL-persistent step navigation ────────────────────────────────────────

  function gotoStep(n: number, id: string) {
    setStep(n);
    router.replace(`/crm/dispatch/${id}/edit?step=${STEP_SLUGS[n]}`);
  }

  // ── Save draft to API ──────────────────────────────────────────────────────

  async function saveDraft(patch: Record<string, unknown>): Promise<string> {
    const body = {
      ...patch,
      name: details.name,
      subject: details.subject,
      preview_text: details.preview_text,
      from_name: details.from_name,
      from_email: `${details.from_local}@${details.from_domain}`,
      reply_to: details.reply_to || null,
      audience_type: audience.audience_type,
      audience_list_id: audience.audience_list_id,
      audience_segment_filters: audience.audience_segment_filters,
      audience_person_ids: audience.audience_person_ids ?? null,
    };

    const method = campaignId ? "PATCH" : "POST";
    const url = campaignId
      ? `/api/dispatch/campaign/${campaignId}`
      : "/api/dispatch/campaign";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to save campaign");
    return json.id as string;
  }

  // ── Step navigation ────────────────────────────────────────────────────────

  async function advanceStep() {
    setError(null);

    if (step === 0) {
      const err = validateStep0();
      if (err) { setError(err); return; }
      setSaving(true);
      try {
        const id = await saveDraft({ status: "draft" });
        if (!campaignId) {
          // Navigate to the persistent edit URL so refresh restores draft + step
          router.push(`/crm/dispatch/${id}/edit?step=audience`);
          return;
        }
        gotoStep(1, id);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }

      // Fetch audience count before moving on
      setSaving(true);
      try {
        const id = await saveDraft({ status: "draft" });
        if (!campaignId) setCampaignId(id);

        // For manual selection, count is just the array length — no API call needed
        if (audience.audience_type === "manual") {
          setAudienceCount(audience.audience_person_ids?.length ?? 0);
        } else {
          const previewBody =
            audience.audience_type === "list"
              ? { audience_type: "list", audience_list_id: audience.audience_list_id }
              : { audience_type: "segment", audience_segment_filters: audience.audience_segment_filters };
          const res = await fetch("/api/dispatch/audience-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(previewBody),
          });
          const json = await res.json();
          if (res.ok) setAudienceCount(json.count ?? null);
        }
        gotoStep(2, id);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Step 2 → 3: Design export happens via StepDesign's own button
    if (step === 2) return;

    setStep((s) => s + 1);
  }

  // Called by StepDesign after Unlayer exports
  function handleDesignExport(data: DesignData) {
    setDesign(data);
    setSaving(true);
    saveDraft({ design_json: data.design_json, html_body: data.html_body })
      .then((id) => {
        if (!campaignId) setCampaignId(id);
        gotoStep(3, id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  }

  // ── Send / Schedule ────────────────────────────────────────────────────────

  async function handleSendNow() {
    if (!campaignId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/dispatch/send/${campaignId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      router.push(`/crm/dispatch/${campaignId}`);
    } catch (e: any) {
      setError(e.message);
      setSending(false);
    }
  }

  async function handleSchedule(scheduledAt: string) {
    if (!campaignId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/dispatch/campaign/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "scheduled", scheduled_at: scheduledAt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Schedule failed");
      router.push(`/crm/dispatch`);
    } catch (e: any) {
      setError(e.message);
      setSending(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={i > step}
            onClick={() => i < step && campaignId && gotoStep(i, campaignId)}
            style={{
              ...stepIndicatorStyle(i === step, i < step),
              cursor: i < step ? "pointer" : "default",
            }}
          >
            {i < step ? "✓ " : `${i + 1}. `}
            {label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid #ef4444",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Step content */}
      {step === 0 && (
        <>
          <StepDetails data={details} onChange={patchDetails} domains={domains} />
          <div>
            <button
              type="button"
              className="gg-btn-primary"
              onClick={advanceStep}
              disabled={saving}
            >
              {saving ? "Saving…" : "Next: Audience →"}
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <StepAudience data={audience} onChange={patchAudience} walklists={walklists} />
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="gg-btn-ghost" onClick={() => campaignId && gotoStep(0, campaignId)}>
              ← Back
            </button>
            <button
              type="button"
              className="gg-btn-primary"
              onClick={advanceStep}
              disabled={saving}
            >
              {saving ? "Saving…" : "Next: Design →"}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <button
            type="button"
            className="gg-btn-ghost"
            onClick={() => campaignId && gotoStep(1, campaignId)}
            style={{ alignSelf: "flex-start", fontSize: 13 }}
          >
            ← Back to Audience
          </button>
          <StepDesign
            initialDesign={design.design_json}
            onExport={handleDesignExport}
            saving={saving}
          />
        </>
      )}

      {step === 3 && (
        <StepReview
          details={details}
          audience={audience}
          audienceCount={audienceCount}
          htmlBody={design.html_body}
          onSendNow={handleSendNow}
          onSchedule={handleSchedule}
          sending={sending}
          campaignId={campaignId}
        />
      )}
    </div>
  );
}
