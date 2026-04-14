"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ChevronUp, ChevronDown, Trash2, Plus, Copy,
  GripVertical, ArrowLeft, ExternalLink, ChevronRight,
  Settings2, Users, Layout,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionType =
  | "multiple_choice"
  | "multiple_choice_with_other"
  | "multiple_select"
  | "multiple_select_with_other"
  | "text"
  | "text_short"
  | "yes_no"
  | "date"
  | "rating"
  | "number"
  | "email"
  | "phone"
  | "product_picker";

type DisplayFormat = "list" | "dropdown" | null;

type CrmField = string; // "table.column" (e.g. "people.first_name") or legacy bare value

type QuestionCondition = {
  show_if: { question_id: string; operator: "equals" | "not_equals" | "contains"; value: string };
} | null;

type LocalQuestion = {
  id: string;
  question_text: string;
  description: string;
  question_type: QuestionType;
  options: string[];
  display_format: DisplayFormat;
  randomize_choices: boolean;
  crm_field: CrmField | null;
  required: boolean;
  order_index: number;
  conditions: QuestionCondition;
  isNew: boolean;
};

type ViewType = "embedded" | "hosted" | "door" | "call" | "text";
type PaginationMode = "one_at_a_time" | "all_at_once" | "pages";

type ViewConfig = {
  pagination: PaginationMode;
  // page_groups: pages × rows × questionIds. Each row has 1–2 IDs (2 = side-by-side).
  page_groups: string[][][] | null;
};

type CrmUser = { id: string; name: string; email: string };

// Types that have a "list vs dropdown" display format toggle
const CHOICE_TYPES: QuestionType[] = [
  "multiple_choice", "multiple_choice_with_other",
  "multiple_select", "multiple_select_with_other",
];

const DEFAULT_VIEW_CONFIGS: Record<ViewType, ViewConfig> = {
  embedded: { pagination: "one_at_a_time", page_groups: null },
  hosted:   { pagination: "one_at_a_time", page_groups: null },
  door:     { pagination: "one_at_a_time", page_groups: null },
  call:     { pagination: "one_at_a_time", page_groups: null },
  text:     { pagination: "all_at_once",   page_groups: null },
};

const VIEW_LABELS: Record<ViewType, string> = {
  embedded: "Embedded",
  hosted:   "Hosted",
  door:     "Door",
  call:     "Call",
  text:     "Text",
};

function newTmpId() {
  return "tmp-" + Math.random().toString(36).slice(2, 10);
}

function blankQuestion(order_index: number): LocalQuestion {
  return {
    id: newTmpId(),
    question_text: "",
    description: "",
    question_type: "multiple_choice",
    options: ["", ""],
    display_format: null,
    randomize_choices: false,
    crm_field: null,
    required: true,
    order_index,
    conditions: null,
    isNew: true,
  };
}

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#111827" : "#ffffff";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SurveyBuilder({
  surveyId,
  hasSurveyBranding = false,
}: {
  surveyId?: string;
  hasSurveyBranding?: boolean;
}) {
  const router = useRouter();
  const isNew = !surveyId;

  // Survey meta
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [postSubmitSurveyId, setPostSubmitSurveyId] = useState<string>("");
  const [embeddableSurveys, setEmbeddableSurveys] = useState<{ id: string; title: string }[]>([]);
  const [activeChannels, setActiveChannels] = useState<Set<string>>(new Set(["embedded","hosted","doors","dials","texts"]));

  // Opportunity trigger
  const [oppEnabled, setOppEnabled] = useState(false);
  const [oppMode, setOppMode] = useState<"always" | "condition">("always");
  const [oppQuestionId, setOppQuestionId] = useState("");
  const [oppOperator, setOppOperator] = useState<"equals" | "not_equals" | "contains">("equals");
  const [oppValue, setOppValue] = useState("");
  const [oppContactType, setOppContactType] = useState("");
  const [oppStage, setOppStage] = useState("");
  const [oppTitleTemplate, setOppTitleTemplate] = useState("{{last_name}} — {{date}}");
  const [contactTypes, setContactTypes] = useState<{ key: string; label: string }[]>([]);
  const [oppStages, setOppStages] = useState<{ key: string; label: string }[]>([]);

  // Op intake channels
  const [opIntakeChannels, setOpIntakeChannels] = useState<Set<string>>(new Set());

  // Contact prefill
  const [prefillContact, setPrefillContact] = useState(false);

  // Payment
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [publicSlug, setPublicSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);

  // Auto pre-filled fields
  const [autoFields, setAutoFields] = useState<{ id: string; crm_field: string; value: string }[]>([]);

  // Storefront / order form
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [limitProducts, setLimitProducts] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; sku: string | null }[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Questions
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  // View configs
  const [viewConfigs, setViewConfigs] = useState<Record<ViewType, ViewConfig>>({ ...DEFAULT_VIEW_CONFIGS });
  const [activeViewTab, setActiveViewTab] = useState<ViewType>("embedded");

  // User assignments
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersFetched, setUsersFetched] = useState(false);

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showViewConfig, setShowViewConfig] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load existing survey ──────────────────────────────────────────────────
  useEffect(() => {
    if (!surveyId) return;
    fetch(`/api/survey/${surveyId}?edit=1`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        const s = data.survey;
        setTitle(s.title ?? "");
        setDescription(s.description ?? "");
        setWebsiteUrl(s.website_url ?? "");
        setFooterText(s.footer_text ?? "");
        const channels = Array.isArray(s.active_channels) && s.active_channels.length > 0
          ? s.active_channels
          : (s.active ? ["embedded","hosted","doors","dials","texts"] : []);
        setActiveChannels(new Set(channels));
        setPublicSlug(s.public_slug ?? s.id ?? "");
        setPostSubmitSurveyId(s.post_submit_survey_id ?? "");
        // Opp trigger
        const ot = s.opp_trigger as any;
        if (ot?.enabled) {
          setOppEnabled(true);
          setOppMode(ot.mode ?? "always");
          setOppQuestionId(ot.question_id ?? "");
          setOppOperator(ot.operator ?? "equals");
          setOppValue(ot.value ?? "");
          setOppContactType(ot.contact_type ?? "");
          setOppStage(ot.stage ?? "");
          setOppTitleTemplate(ot.title_template ?? "{{last_name}} — {{date}}");
        }
        setOpIntakeChannels(new Set(s.op_intake_channels ?? []));
        setPrefillContact(Boolean(s.prefill_contact));
        setPaymentEnabled(Boolean(s.payment_enabled));
        setDeliveryEnabled(Boolean(s.delivery_enabled));
        const af = Array.isArray(s.auto_fields) ? s.auto_fields : [];
        setAutoFields(af.map((f: any) => ({ id: newTmpId(), crm_field: f.crm_field ?? "", value: f.value ?? "" })));
        const orderProds: string[] | null = s.order_products ?? null;
        if (orderProds && orderProds.length > 0) {
          setLimitProducts(true);
          setSelectedProductIds(new Set(orderProds));
        }

        const qs: LocalQuestion[] = (data.questions ?? []).map((q: any) => ({
          id: q.id,
          question_text: q.question_text,
          description: q.description ?? "",
          question_type: q.question_type as QuestionType,
          options: q.options ?? [],
          display_format: q.display_format ?? null,
          randomize_choices: Boolean(q.randomize_choices),
          crm_field: q.crm_field ?? null,
          required: Boolean(q.required),
          order_index: q.order_index,
          conditions: q.conditions ?? null,
          isNew: false,
        }));
        setQuestions(qs);

        // Load view configs
        const cfgs: Record<ViewType, ViewConfig> = { ...DEFAULT_VIEW_CONFIGS };
        for (const vc of data.viewConfigs ?? []) {
          cfgs[vc.view_type as ViewType] = {
            pagination: vc.pagination,
            page_groups: (vc.page_groups as string[][][] | null) ?? null,
          };
        }
        setViewConfigs(cfgs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [surveyId]);

  const isActive = activeChannels.size > 0;

  // Load user assignments when survey has any active channel (for existing surveys)
  useEffect(() => {
    if (!isActive || !surveyId || usersFetched) return;
    setUsersLoading(true);
    setUsersFetched(true);
    Promise.all([
      fetch("/api/crm/users").then((r) => r.json()),
      fetch(`/api/survey/${surveyId}/assignments`).then((r) => r.json()),
    ])
      .then(([users, assignments]) => {
        setCrmUsers(Array.isArray(users) ? users : []);
        setAssignedUserIds(new Set(assignments.user_ids ?? []));
      })
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, [isActive, surveyId, usersFetched]);

  // Fetch users when first activated for a new survey
  useEffect(() => {
    if (!isActive || usersFetched || crmUsers.length > 0) return;
    setUsersLoading(true);
    setUsersFetched(true);
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((users) => setCrmUsers(Array.isArray(users) ? users : []))
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, [isActive, usersFetched, crmUsers.length]);

  // Load embeddable surveys + contact types when Advanced Options opens
  useEffect(() => {
    if (!showAdvanced) return;
    if (embeddableSurveys.length === 0) {
      fetch("/api/survey?channel=embedded")
        .then((r) => r.json())
        .then((list: { id: string; title: string }[]) => setEmbeddableSurveys(list.filter((s) => s.id !== surveyId)))
        .catch(() => {});
    }
    if (contactTypes.length === 0) {
      fetch("/api/crm/settings/contact-types")
        .then((r) => r.json())
        .then((data: any) => setContactTypes(Array.isArray(data) ? data : (data.types ?? [])))
        .catch(() => {});
    }
  }, [showAdvanced, surveyId]);

  // Load stages when oppContactType changes
  useEffect(() => {
    if (!oppEnabled) return;
    const url = oppContactType
      ? `/api/crm/opportunities/stages?contact_type=${encodeURIComponent(oppContactType)}`
      : "/api/crm/opportunities/stages";
    fetch(url)
      .then((r) => r.json())
      .then((data: any) => setOppStages(Array.isArray(data) ? data : (data.stages ?? [])))
      .catch(() => {});
  }, [oppEnabled, oppContactType]);

  // ── Question helpers ──────────────────────────────────────────────────────
  function addQuestion() {
    const q = blankQuestion(questions.length + 1);
    setQuestions((prev) => [...prev, q]);
    setExpandedId(q.id);
  }

  function updateQuestion(id: string, patch: Partial<LocalQuestion>) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== id);
      return filtered.map((q, i) => ({ ...q, order_index: i + 1 }));
    });
    if (!id.startsWith("tmp-")) {
      setDeletedIds((prev) => [...prev, id]);
    }
    removeQFromPageGroups(id);
    if (expandedId === id) setExpandedId(null);
  }

  function duplicateQuestion(id: string) {
    setQuestions((prev) => {
      const q = prev.find((x) => x.id === id);
      if (!q) return prev;
      const copy: LocalQuestion = { ...q, id: newTmpId(), isNew: true };
      const idx = prev.findIndex((x) => x.id === id);
      const arr = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      return arr.map((x, i) => ({ ...x, order_index: i + 1 }));
    });
  }

  function moveQuestion(id: string, dir: -1 | 1) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((q, i) => ({ ...q, order_index: i + 1 }));
    });
  }

  function setOptionText(qId: string, optIdx: number, val: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        opts[optIdx] = val;
        return { ...q, options: opts };
      })
    );
  }

  function addOption(qId: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, options: [...q.options, ""] } : q))
    );
  }

  function removeOption(qId: string, optIdx: number) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        return { ...q, options: q.options.filter((_, i) => i !== optIdx) };
      })
    );
  }

  function handleTypeChange(qId: string, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        let options = q.options;
        let display_format = q.display_format;
        if (type === "yes_no") { options = ["Yes", "No"]; display_format = null; }
        else if (type === "rating") { options = ["5"]; display_format = null; }
        else if (!CHOICE_TYPES.includes(type)) { options = []; display_format = null; }
        else if (options.length === 0) options = ["", ""];
        if (!CHOICE_TYPES.includes(type)) display_format = null;
        return { ...q, question_type: type, options, display_format };
      })
    );
  }

  // ── View config helpers ───────────────────────────────────────────────────
  function updateViewConfig(vt: ViewType, patch: Partial<ViewConfig>) {
    setViewConfigs((prev) => ({ ...prev, [vt]: { ...prev[vt], ...patch } }));
  }

  /** Convert flat question list to initial page_groups (1 page, each question in its own row) */
  function initPageGroups(vt: ViewType) {
    updateViewConfig(vt, { page_groups: [questions.map((q) => [q.id])] });
  }

  function addPage(vt: ViewType) {
    setViewConfigs((prev) => {
      const cfg = prev[vt];
      const groups = cfg.page_groups ?? [questions.map((q) => [q.id])];
      return { ...prev, [vt]: { ...cfg, page_groups: [...groups, []] } };
    });
  }

  function removePage(vt: ViewType, pageIdx: number) {
    setViewConfigs((prev) => {
      const cfg = prev[vt];
      if (!cfg.page_groups || cfg.page_groups.length <= 1) return prev;
      const groups = cfg.page_groups.map((page) => page.map((row) => [...row]));
      const removed = groups.splice(pageIdx, 1)[0];
      const targetIdx = Math.max(0, pageIdx - 1);
      if (groups[targetIdx]) {
        groups[targetIdx] = [...groups[targetIdx], ...removed];
      }
      return { ...prev, [vt]: { ...cfg, page_groups: groups } };
    });
  }

  /** Update layout for a single view — used by FormLayoutEditor */
  function setPageGroups(vt: ViewType, groups: string[][][]) {
    setViewConfigs((prev) => ({ ...prev, [vt]: { ...prev[vt], page_groups: groups } }));
  }

  /** Remove deleted question from all view config page_groups */
  function removeQFromPageGroups(qId: string) {
    setViewConfigs((prev) => {
      const next = { ...prev };
      for (const vt of Object.keys(next) as ViewType[]) {
        if (!next[vt].page_groups) continue;
        next[vt] = {
          ...next[vt],
          page_groups: next[vt].page_groups!.map((page) =>
            page.map((row) => row.filter((id) => id !== qId)).filter((row) => row.length > 0)
          ).filter((page) => page.length > 0),
        };
      }
      return next;
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) { alert("Please enter a survey title."); return; }
    setSaving(true);
    setSaveStatus("idle");
    setSaveError("");

    try {
      let sid = surveyId;

      if (isNew) {
        const res = await fetch("/api/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, id: publicSlug.trim() || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create survey");
        sid = data.survey_id;
      } else {
        const res = await fetch(`/api/survey/${sid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, description,
            website_url: websiteUrl || null,
            footer_text: footerText || null,
            active_channels: [...activeChannels],
            public_slug: publicSlug.trim() || null,
            post_submit_survey_id: postSubmitSurveyId || null,
            opp_trigger: oppEnabled ? {
              enabled: true,
              mode: oppMode,
              question_id: oppMode === "condition" ? oppQuestionId || null : null,
              operator: oppMode === "condition" ? oppOperator : null,
              value: oppMode === "condition" ? oppValue : null,
              contact_type: oppContactType || null,
              stage: oppStage || null,
              title_template: oppTitleTemplate || "{{last_name}} — {{date}}",
            } : null,
            op_intake_channels: [...opIntakeChannels],
            prefill_contact: prefillContact,
            payment_enabled: paymentEnabled,
            storefront_mode: activeChannels.has("storefront") ? "take_order" : null,
            delivery_enabled: deliveryEnabled,
            order_products: limitProducts && selectedProductIds.size > 0 ? [...selectedProductIds] : null,
            auto_fields: autoFields.filter(f => f.crm_field && f.value.trim()).map(({ crm_field, value }) => ({ crm_field, value: value.trim() })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) {
            setSaveError(data.error ?? "Slug already taken");
            setSaveStatus("error");
            return;
          }
          throw new Error(data.error ?? "Failed to update survey");
        }
      }

      // Delete removed questions
      for (const delId of deletedIds) {
        await fetch(`/api/survey/${sid}/questions/${delId}`, { method: "DELETE" });
      }
      setDeletedIds([]);

      // Save questions
      const savedQuestions: LocalQuestion[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = { ...questions[i], order_index: i + 1 };
        const body = {
          question_text: q.question_text,
          description: q.description || null,
          question_type: q.question_type,
          options: q.options.filter((o) => o.trim()),
          display_format: q.display_format ?? null,
          randomize_choices: q.randomize_choices,
          crm_field: q.crm_field ?? null,
          required: q.required,
          order_index: q.order_index,
          conditions: q.conditions ?? null,
        };

        if (q.isNew) {
          const res = await fetch(`/api/survey/${sid}/questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to create question");
          savedQuestions.push({ ...q, id: data.question_id, isNew: false });
        } else {
          await fetch(`/api/survey/${sid}/questions/${q.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          savedQuestions.push({ ...q, isNew: false });
        }
      }
      setQuestions(savedQuestions);

      // Save view configs
      await fetch(`/api/survey/${sid}/view-configs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configs: (Object.entries(viewConfigs) as [ViewType, ViewConfig][]).map(([vt, cfg]) => ({
            view_type: vt,
            pagination: cfg.pagination,
            page_groups: cfg.page_groups ?? null,
          })),
        }),
      });

      // Save user assignments (only for existing surveys)
      if (sid && !isNew) {
        await fetch(`/api/survey/${sid}/assignments`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: [...assignedUserIds] }),
        });
      }

      setSaveStatus("saved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 2500);

      if (isNew && sid) router.replace(`/crm/survey/${sid}/edit`);
    } catch (err: any) {
      console.error(err);
      setSaveError(err?.message ?? "An error occurred");
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete survey ─────────────────────────────────────────────────────────
  async function handleDeleteSurvey() {
    if (!surveyId) return;
    if (!confirm(`Delete "${title}"? This will remove all responses and cannot be undone.`)) return;
    await fetch(`/api/survey/${surveyId}`, { method: "DELETE" });
    router.push("/crm/survey");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="stack">
        <div style={{ padding: 48, textAlign: "center", opacity: 0.5 }}>Loading survey…</div>
      </section>
    );
  }

  const cfg = viewConfigs[activeViewTab];

  return (
    <section className="stack" style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a
          href="/crm/survey"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, opacity: 0.6, textDecoration: "none" }}
        >
          <ArrowLeft size={14} /> Surveys
        </a>
        <div style={{ flex: 1 }} />
        {surveyId && (
          <a
            href={`/s/${publicSlug || surveyId}?preview=1`}
            target="_blank"
            rel="noreferrer"
            style={{ ...ghostBtnStyle }}
          >
            Preview <ExternalLink size={13} />
          </a>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            ...primaryBtnStyle,
            cursor: saving ? "not-allowed" : "pointer",
            background: saveStatus === "saved" ? "#22c55e" : saveStatus === "error" ? "#ef4444" : "var(--gg-primary, #2563eb)",
          }}
        >
          {saving ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error — retry" : "Save Survey"}
        </button>
      </div>

      {saveStatus === "error" && saveError && (
        <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#dc2626", fontSize: 14 }}>
          {saveError}
        </div>
      )}

      {/* ── Survey meta ── */}
      <div style={{ background: "var(--gg-card, white)", borderRadius: 12, border: "1px solid var(--gg-border, #e5e7eb)", padding: 24, display: "grid", gap: 16 }}>
        {/* Title */}
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Survey Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugManual && isNew) {
                setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
              }
            }}
            placeholder="e.g. Voter Issues Survey 2026"
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description for canvassers"
            style={inputStyle}
          />
        </div>

        {/* Active channel toggles */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>Active in</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {([
              { key: "all",        label: "All" },
              { key: "embedded",   label: "Embedded" },
              { key: "hosted",     label: "Hosted" },
              { key: "doors",      label: "Doors" },
              { key: "dials",      label: "Dials" },
              { key: "texts",      label: "Texts" },
              { key: "storefront", label: "Storefront" },
            ] as const).map(({ key: ch, label }) => {
              const isAll = ch === "all";
              const allKeys = ["embedded","hosted","doors","dials","texts","storefront"] as const;
              const checked = isAll
                ? allKeys.every(c => activeChannels.has(c))
                : activeChannels.has(ch);
              return (
                <label
                  key={ch}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                    padding: "5px 12px", borderRadius: 20, fontSize: 13,
                    border: `1px solid ${checked ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                    background: checked ? "rgba(37,99,235,0.08)" : "transparent",
                    fontWeight: checked ? 600 : 400,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    style={{ width: 13, height: 13, cursor: "pointer" }}
                    onChange={(e) => {
                      const next = new Set(activeChannels);
                      if (isAll) {
                        if (e.target.checked) allKeys.forEach(c => next.add(c));
                        else next.clear();
                      } else {
                        if (e.target.checked) next.add(ch);
                        else next.delete(ch);
                      }
                      setActiveChannels(next);
                    }}
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {activeChannels.size === 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#dc2626" }}>Survey is inactive — not visible anywhere.</p>
          )}
        </div>

        {/* User assignment (when active, existing surveys) */}
        {isActive && surveyId && (
          <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)", paddingTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Users size={14} style={{ opacity: 0.5 }} />
              <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>Visible to (leave empty = all users)</span>
            </div>
            {usersLoading ? (
              <div style={{ fontSize: 13, opacity: 0.5 }}>Loading users…</div>
            ) : crmUsers.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.5 }}>No CRM users found</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {crmUsers.map((u) => {
                  const checked = assignedUserIds.has(u.id);
                  return (
                    <label
                      key={u.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                        padding: "5px 10px", borderRadius: 20, fontSize: 13,
                        border: `1px solid ${checked ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                        background: checked ? "rgba(37,99,235,0.08)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        style={{ width: 13, height: 13, cursor: "pointer" }}
                        onChange={(e) => {
                          const next = new Set(assignedUserIds);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          setAssignedUserIds(next);
                        }}
                      />
                      {u.name || u.email}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Advanced Options disclosure */}
        <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)", paddingTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
              background: "none", border: "none", cursor: "pointer",
              color: "var(--gg-text-dim, #6b7280)", padding: 0,
            }}
          >
            <Settings2 size={14} />
            Advanced Options
            <ChevronRight size={14} style={{ transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </button>

          {showAdvanced && (
            <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
              {/* Public slug */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>Public URL Slug</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.5, whiteSpace: "nowrap" }}>/s/</span>
                  <input
                    type="text"
                    value={publicSlug}
                    onChange={(e) => {
                      setSlugManual(true);
                      setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    placeholder="my-survey-slug"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {publicSlug && (
                    <button
                      type="button"
                      title="Copy URL"
                      onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/s/${publicSlug}`)}
                      style={{ ...ghostBtnStyle, padding: "6px 12px", whiteSpace: "nowrap" }}
                    >
                      Copy URL
                    </button>
                  )}
                </div>
                {!isNew && (
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.5 }}>
                    Old URL (<code>/s/{surveyId}</code>) still works after renaming.
                  </p>
                )}
              </div>

              {/* Learn More URL */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>"Learn More" URL (optional)</label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={inputStyle}
                />
              </div>

              {/* Footer text */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>Footer text (optional)</label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Paid for by…"
                  style={inputStyle}
                />
              </div>

              {/* Post-submit embedded form */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>Post-submit form (optional)</label>
                <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
                  After completing this survey, show another embeddable form (e.g. a contact form). Only surveys active for the Embedded channel appear here.
                </p>
                <select
                  value={postSubmitSurveyId}
                  onChange={(e) => setPostSubmitSurveyId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">(None)</option>
                  {embeddableSurveys.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>

              {/* ── Opportunity Creation Trigger ── */}
              <div style={{ display: "grid", gap: 8, paddingTop: 16, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={oppEnabled} onChange={(e) => setOppEnabled(e.target.checked)} />
                  Opportunity Creation Trigger
                </label>
                {oppEnabled && (
                  <div style={{ display: "grid", gap: 10, paddingLeft: 4 }}>
                    {/* Mode */}
                    <div style={{ display: "flex", gap: 16 }}>
                      {(["always", "condition"] as const).map((m) => (
                        <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                          <input type="radio" name="opp-mode" checked={oppMode === m} onChange={() => setOppMode(m)} />
                          {m === "always" ? "Always" : "When condition met"}
                        </label>
                      ))}
                    </div>

                    {/* Condition row */}
                    {oppMode === "condition" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                        <select value={oppQuestionId} onChange={(e) => setOppQuestionId(e.target.value)} style={{ ...inputStyle, fontSize: 13 }}>
                          <option value="">(Select question)</option>
                          {questions.map((q) => <option key={q.id} value={q.id}>{(q.question_text || "Untitled").slice(0, 50)}</option>)}
                        </select>
                        <select value={oppOperator} onChange={(e) => setOppOperator(e.target.value as any)} style={{ ...inputStyle, fontSize: 13, width: "auto" }}>
                          <option value="equals">equals</option>
                          <option value="not_equals">≠</option>
                          <option value="contains">contains</option>
                        </select>
                        <input value={oppValue} onChange={(e) => setOppValue(e.target.value)} placeholder="value to match" style={{ ...inputStyle, fontSize: 13 }} />
                      </div>
                    )}

                    {/* Pipeline + Stage */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, display: "block" }}>Pipeline (optional)</label>
                        <select value={oppContactType} onChange={(e) => setOppContactType(e.target.value)} style={{ ...inputStyle, fontSize: 13 }}>
                          <option value="">(Default)</option>
                          {contactTypes.map((ct) => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, display: "block" }}>Stage</label>
                        <select value={oppStage} onChange={(e) => setOppStage(e.target.value)} style={{ ...inputStyle, fontSize: 13 }}>
                          <option value="">(First stage)</option>
                          {oppStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Title template */}
                    <OppTitleTemplateEditor value={oppTitleTemplate} onChange={setOppTitleTemplate} />

                    {/* Op intake channels */}
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 4, display: "block" }}>Use this survey as default intake form for</label>
                      <p style={{ margin: "0 0 6px", fontSize: 12, opacity: 0.6 }}>After an opportunity is created in a field session, this form will be shown to capture details.</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[["door", "Doors"], ["dials", "Dials"], ["texts", "Texts"], ["take_order", "Take Order"], ["make_sale", "Make Sale"], ["take_survey", "Take Survey"], ["storefront", "Storefront"]].map(([ch, label]) => (
                          <label key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${opIntakeChannels.has(ch) ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`, background: opIntakeChannels.has(ch) ? "rgba(37,99,235,0.08)" : "transparent" }}>
                            <input type="checkbox" checked={opIntakeChannels.has(ch)} onChange={(e) => {
                              const next = new Set(opIntakeChannels);
                              if (e.target.checked) next.add(ch); else next.delete(ch);
                              setOpIntakeChannels(next);
                            }} style={{ display: "none" }} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Auto Pre-filled Fields ── */}
              <div style={{ display: "grid", gap: 10, paddingTop: 16, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                <div>
                  <div style={{ ...labelStyle, display: "block", marginBottom: 2 }}>Auto Pre-filled Fields</div>
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
                    Values set automatically on every submission — not shown to the respondent.
                    Use this to tag all responses from this form (e.g. Contact Type = Volunteer).
                  </p>
                </div>
                {autoFields.map((af, idx) => (
                  <div key={af.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                    <CrmFieldPicker
                      value={af.crm_field || null}
                      onChange={(val) => setAutoFields(prev => prev.map((f, i) => i === idx ? { ...f, crm_field: val ?? "" } : f))}
                    />
                    <input
                      type="text"
                      value={af.value}
                      onChange={(e) => setAutoFields(prev => prev.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))}
                      placeholder="Value"
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => setAutoFields(prev => prev.filter((_, i) => i !== idx))}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 4, opacity: 0.4, color: "#dc2626", lineHeight: 1 }}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAutoFields(prev => [...prev, { id: newTmpId(), crm_field: "", value: "" }])}
                  style={{ ...ghostBtnStyle, padding: "6px 12px", width: "fit-content" }}
                >
                  <Plus size={13} /> Add field
                </button>
              </div>

              {/* ── Contact prefill ── */}
              <div style={{ display: "grid", gap: 6, paddingTop: 16, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={prefillContact} onChange={(e) => setPrefillContact(e.target.checked)} />
                  Pre-fill known contact info
                </label>
                {prefillContact && (
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
                    When a survey link includes a contact ID, the respondent's name, email, and phone will be automatically filled into matching questions. Disable this if you'd rather not reveal that you already have their information.
                  </p>
                )}
              </div>

              {/* ── Payment Gate ── */}
              <div style={{ display: "grid", gap: 6, paddingTop: 16, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={paymentEnabled} onChange={(e) => setPaymentEnabled(e.target.checked)} />
                  Require payment after submission
                </label>
                {paymentEnabled && (
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
                    After submitting, respondents will be directed to a payment page. Payment processor configuration is set up separately.
                  </p>
                )}
              </div>

              {/* ── Delivery ── shown when opportunity trigger is enabled (works for all channels) */}
              {oppEnabled && (
                <div style={{ display: "grid", gap: 6, paddingTop: 16, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                  <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={deliveryEnabled} onChange={(e) => setDeliveryEnabled(e.target.checked)} />
                    Enable Delivery option
                  </label>
                  {deliveryEnabled && (
                    <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
                      Respondents can choose Pickup or Delivery. When Delivery is selected, an address form is shown and required before submit.
                    </p>
                  )}
                </div>
              )}

              {/* Branding (FieldPack+) */}
              {!hasSurveyBranding && (
                <div style={{ padding: "10px 14px", borderRadius: 8, border: "1px dashed var(--gg-border, #e5e7eb)", fontSize: 13, opacity: 0.6 }}>
                  <strong>Tenant Branding</strong> — custom colors, logo, and fonts on hosted/embedded forms. Available on FieldPack and above.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Questions ── */}
      <div style={{ display: "grid", gap: 12 }}>
        {questions.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", borderRadius: 12, border: "2px dashed var(--gg-border, #e5e7eb)", opacity: 0.5, fontSize: 14, color: "var(--gg-text, inherit)" }}>
            No questions yet — click "Add Question" below
          </div>
        )}

        {questions.map((q, idx) => {
          const expanded = expandedId === q.id;
          const typeLabel = QUESTION_TYPE_META[q.question_type]?.label ?? q.question_type;
          const isChoice = CHOICE_TYPES.includes(q.question_type);
          const hasOptions = isChoice && q.question_type !== "yes_no";

          return (
            <div
              key={q.id}
              style={{
                background: "var(--gg-card, white)",
                borderRadius: 12,
                border: `1px solid ${expanded ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}
            >
              {/* Question header row */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", userSelect: "none" }}
                onClick={() => setExpandedId(expanded ? null : q.id)}
              >
                <GripVertical size={14} style={{ opacity: 0.3, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.4, flexShrink: 0, minWidth: 24 }}>Q{idx + 1}</span>
                <span style={{ flex: 1, fontSize: 14, opacity: q.question_text ? 1 : 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--gg-text, inherit)" }}>
                  {q.question_text || "Untitled question"}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "var(--gg-filter-bg, rgba(37,99,235,0.06))", whiteSpace: "nowrap", flexShrink: 0, color: "var(--gg-text, inherit)" }}>
                  {typeLabel}
                </span>
                {q.conditions?.show_if?.question_id && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "#b45309", whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "0.04em" }}>
                    IF
                  </span>
                )}
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <IconBtn title="Move up" disabled={idx === 0} onClick={() => moveQuestion(q.id, -1)}><ChevronUp size={14} /></IconBtn>
                  <IconBtn title="Move down" disabled={idx === questions.length - 1} onClick={() => moveQuestion(q.id, 1)}><ChevronDown size={14} /></IconBtn>
                  <IconBtn title="Duplicate question" onClick={() => duplicateQuestion(q.id)}><Copy size={14} /></IconBtn>
                  <IconBtn title="Delete question" danger onClick={() => { if (confirm("Remove this question?")) removeQuestion(q.id); }}><Trash2 size={14} /></IconBtn>
                </div>
              </div>

              {/* Expanded editor */}
              {expanded && (
                <div style={{ padding: "0 16px 20px", borderTop: "1px solid var(--gg-border, #e5e7eb)", display: "grid", gap: 14 }}>
                  {/* Question text */}
                  <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
                    <label style={labelStyle}>Question text *</label>
                    <textarea
                      rows={2}
                      value={q.question_text}
                      onChange={(e) => updateQuestion(q.id, { question_text: e.target.value })}
                      placeholder="Type your question here…"
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Description / help text */}
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={labelStyle}>Description <span style={{ opacity: 0.45, fontWeight: 400 }}>(optional — supports **bold**, *italic*, - bullet lists, blank line for paragraph break)</span></label>
                    <textarea
                      rows={3}
                      value={q.description}
                      onChange={(e) => updateQuestion(q.id, { description: e.target.value })}
                      placeholder={"Add clarifying text, instructions, or context…\n\nSupports **bold**, *italic*, and:\n- bullet\n- lists"}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontSize: 12 }}
                    />
                  </div>

                  {/* Type + Required + Display format row */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 200 }}>
                      <label style={labelStyle}>Question type</label>
                      <select
                        value={q.question_type}
                        onChange={(e) => handleTypeChange(q.id, e.target.value as QuestionType)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <optgroup label="Choice — Single">
                          <option value="multiple_choice">Multiple Choice (list)</option>
                          <option value="multiple_choice_with_other">Multiple Choice + Other</option>
                        </optgroup>
                        <optgroup label="Choice — Multi">
                          <option value="multiple_select">Multi-Select (list)</option>
                          <option value="multiple_select_with_other">Multi-Select + Other</option>
                        </optgroup>
                        <optgroup label="Scale">
                          <option value="yes_no">Yes / No</option>
                          <option value="rating">Rating Scale</option>
                        </optgroup>
                        <optgroup label="Open-ended">
                          <option value="text_short">Short Text</option>
                          <option value="text">Long Text / Comment</option>
                          <option value="number">Number</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                          <option value="date">Date</option>
                        </optgroup>
                        <optgroup label="Storefront">
                          <option value="product_picker">Product Picker</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Display format toggle for choice types */}
                    {isChoice && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={labelStyle}>Display as</label>
                        <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", overflow: "hidden" }}>
                          {(["list", "dropdown"] as const).map((fmt) => {
                            const active = (q.display_format ?? "list") === fmt;
                            return (
                              <button
                                key={fmt}
                                type="button"
                                onClick={() => updateQuestion(q.id, { display_format: fmt })}
                                style={{
                                  padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                                  background: active ? "var(--gg-primary, #2563eb)" : "transparent",
                                  color: active ? "white" : "var(--gg-text-dim, #6b7280)",
                                }}
                              >
                                {fmt === "list" ? "List" : "Dropdown"}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Rating scale selector */}
                    {q.question_type === "rating" && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={labelStyle}>Scale</label>
                        <select
                          value={q.options[0] ?? "5"}
                          onChange={(e) => updateQuestion(q.id, { options: [e.target.value] })}
                          style={{ ...inputStyle, width: "auto" }}
                        >
                          <option value="5">1 – 5</option>
                          <option value="10">1 – 10</option>
                        </select>
                      </div>
                    )}

                    {isChoice && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", paddingBottom: 2 }}>
                        <input
                          type="checkbox"
                          checked={q.randomize_choices}
                          onChange={(e) => updateQuestion(q.id, { randomize_choices: e.target.checked })}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                        Randomize choices
                      </label>
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", paddingBottom: 2 }}>
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                      Required
                    </label>
                  </div>

                  {/* CRM field mapping */}
                  {q.question_type !== "product_picker" && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={labelStyle}>Map to CRM field <span style={{ fontWeight: 400, opacity: 0.55 }}>(optional)</span></label>
                      <CrmFieldPicker
                        value={q.crm_field ?? null}
                        onChange={(val) => updateQuestion(q.id, { crm_field: val })}
                      />
                    </div>
                  )}

                  {/* Product curation (for product_picker type) */}
                  {q.question_type === "product_picker" && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={labelStyle}>Products to offer</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={limitProducts}
                          onChange={(e) => {
                            setLimitProducts(e.target.checked);
                            if (e.target.checked && !productsLoaded) {
                              setProductsLoaded(true);
                              fetch("/api/crm/products")
                                .then((r) => r.json())
                                .then((list) => setAllProducts(Array.isArray(list) ? list : []))
                                .catch(() => {});
                            }
                          }}
                          style={{ width: 15, height: 15 }}
                        />
                        Limit to specific products
                        <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 400 }}>(default: all active products)</span>
                      </label>
                      {limitProducts && (
                        <div style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, overflow: "hidden" }}>
                          {allProducts.length === 0 ? (
                            <div style={{ padding: "12px 14px", fontSize: 13, opacity: 0.5 }}>Loading products…</div>
                          ) : (
                            allProducts.map((p) => {
                              const sel = selectedProductIds.has(p.id);
                              return (
                                <label
                                  key={p.id}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                                    fontSize: 13, cursor: "pointer",
                                    borderBottom: "1px solid var(--gg-border, #e5e7eb)",
                                    background: sel ? "rgba(37,99,235,0.04)" : "transparent",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={sel}
                                    style={{ width: 14, height: 14, flexShrink: 0 }}
                                    onChange={(e) => {
                                      const next = new Set(selectedProductIds);
                                      if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                      setSelectedProductIds(next);
                                    }}
                                  />
                                  <span style={{ flex: 1, fontWeight: 500 }}>{p.name}</span>
                                  {p.sku && <span style={{ fontSize: 11, opacity: 0.45 }}>SKU: {p.sku}</span>}
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Options editor for choice types (not yes/no) */}
                  {hasOptions && q.question_type !== "yes_no" && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={labelStyle}>Answer choices</label>
                      {q.options.map((opt, oi) => (
                        <div key={oi} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 12, opacity: 0.4, minWidth: 14 }}>{oi + 1}.</span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => setOptionText(q.id, oi, e.target.value)}
                            placeholder={`Choice ${oi + 1}`}
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          {q.options.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeOption(q.id, oi)}
                              style={{ border: "none", background: "none", cursor: "pointer", padding: 4, opacity: 0.4, lineHeight: 1, color: "var(--gg-text, inherit)" }}
                              title="Remove choice"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(q.id)}
                        style={{ ...ghostBtnStyle, padding: "6px 12px" }}
                      >
                        <Plus size={13} /> Add choice
                      </button>
                    </div>
                  )}

                  {/* Yes/No preview */}
                  {q.question_type === "yes_no" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {["Yes", "No"].map((opt) => (
                        <span key={opt} style={{ padding: "6px 18px", borderRadius: 20, border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 13, opacity: 0.6, color: "var(--gg-text, inherit)" }}>
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Rating preview */}
                  {q.question_type === "rating" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {Array.from({ length: parseInt(q.options[0] ?? "5") }, (_, i) => i + 1).map((n) => (
                        <span key={n} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 14, fontWeight: 600, opacity: 0.5, color: "var(--gg-text, inherit)" }}>
                          {n}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Open-ended type hint */}
                  {["text", "text_short", "number", "email", "phone", "date"].includes(q.question_type) && (
                    <div style={{ fontSize: 13, opacity: 0.5, color: "var(--gg-text, inherit)" }}>
                      {q.question_type === "text" && "Renders as a multi-line text area"}
                      {q.question_type === "text_short" && "Renders as a single-line text input"}
                      {q.question_type === "number" && "Renders as a number input"}
                      {q.question_type === "email" && "Renders as an email input with validation"}
                      {q.question_type === "phone" && "Renders as a phone number input"}
                      {q.question_type === "date" && "Renders as a date picker"}
                    </div>
                  )}

                  {/* Conditional display logic */}
                  {idx > 0 && (
                    <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)", paddingTop: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(q.conditions?.show_if?.question_id)}
                          style={{ width: 14, height: 14 }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateQuestion(q.id, {
                                conditions: { show_if: { question_id: questions[0]?.id ?? "", operator: "equals", value: "" } },
                              });
                            } else {
                              updateQuestion(q.id, { conditions: null });
                            }
                          }}
                        />
                        <span style={{ fontWeight: 600, opacity: 0.7 }}>Only show this question when…</span>
                      </label>
                      {q.conditions?.show_if && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginTop: 8, alignItems: "center" }}>
                          <select
                            value={q.conditions.show_if.question_id}
                            onChange={(e) => updateQuestion(q.id, {
                              conditions: { show_if: { ...q.conditions!.show_if, question_id: e.target.value } },
                            })}
                            style={{ ...inputStyle, fontSize: 13 }}
                          >
                            <option value="">(Select question)</option>
                            {questions.slice(0, idx).map((prev, pi) => (
                              <option key={prev.id} value={prev.id}>
                                Q{pi + 1}: {(prev.question_text || "Untitled").slice(0, 50)}
                              </option>
                            ))}
                          </select>
                          <select
                            value={q.conditions.show_if.operator}
                            onChange={(e) => updateQuestion(q.id, {
                              conditions: { show_if: { ...q.conditions!.show_if, operator: e.target.value as "equals" | "not_equals" | "contains" } },
                            })}
                            style={{ ...inputStyle, fontSize: 13, width: "auto" }}
                          >
                            <option value="equals">equals</option>
                            <option value="not_equals">≠</option>
                            <option value="contains">contains</option>
                          </select>
                          <input
                            value={q.conditions.show_if.value}
                            onChange={(e) => updateQuestion(q.id, {
                              conditions: { show_if: { ...q.conditions!.show_if, value: e.target.value } },
                            })}
                            placeholder="value to match"
                            style={{ ...inputStyle, fontSize: 13 }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add Question ── */}
      <button
        type="button"
        onClick={addQuestion}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px", borderRadius: 12,
          border: "2px dashed var(--gg-border, #e5e7eb)",
          background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 600,
          width: "100%", color: "var(--gg-text, inherit)",
          opacity: 0.7, transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
      >
        <Plus size={16} /> Add Question
      </button>

      {/* ── View Configuration ── */}
      <div style={{ background: "var(--gg-card, white)", borderRadius: 12, border: "1px solid var(--gg-border, #e5e7eb)", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setShowViewConfig(!showViewConfig)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "16px 20px",
            background: "none", border: "none", cursor: "pointer", textAlign: "left",
          }}
        >
          <Layout size={16} style={{ opacity: 0.5 }} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "var(--gg-text, inherit)" }}>View Configuration</span>
          <span style={{ fontSize: 12, opacity: 0.5, color: "var(--gg-text, inherit)" }}>
            How questions are displayed per context
          </span>
          <ChevronRight size={14} style={{ opacity: 0.4, transform: showViewConfig ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: "var(--gg-text, inherit)" }} />
        </button>

        {showViewConfig && (
          <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--gg-border, #e5e7eb)", padding: "0 20px" }}>
              {(Object.keys(VIEW_LABELS) as ViewType[]).map((vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => setActiveViewTab(vt)}
                  style={{
                    padding: "10px 14px", border: "none", background: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    borderBottom: activeViewTab === vt ? "2px solid var(--gg-primary, #2563eb)" : "2px solid transparent",
                    color: activeViewTab === vt ? "var(--gg-primary, #2563eb)" : "var(--gg-text-dim, #6b7280)",
                    marginBottom: -1,
                  }}
                >
                  {VIEW_LABELS[vt]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: 20, display: "grid", gap: 16 }}>
              {/* Pagination mode selector */}
              <div>
                <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>
                  How are questions presented in the {VIEW_LABELS[activeViewTab].toLowerCase()} view?
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(["one_at_a_time", "all_at_once", "pages"] as PaginationMode[]).map((mode) => (
                    <label key={mode} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14 }}>
                      <input
                        type="radio"
                        name={`pagination-${activeViewTab}`}
                        checked={cfg.pagination === mode}
                        onChange={() => {
                          if ((mode === "pages" || mode === "all_at_once") && !cfg.page_groups) {
                            initPageGroups(activeViewTab);
                          }
                          updateViewConfig(activeViewTab, { pagination: mode });
                        }}
                        style={{ marginTop: 2, cursor: "pointer" }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--gg-text, inherit)" }}>
                          {mode === "one_at_a_time" && "One question at a time"}
                          {mode === "all_at_once" && "All questions on one page"}
                          {mode === "pages" && "Custom pages"}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.5, color: "var(--gg-text, inherit)" }}>
                          {mode === "one_at_a_time" && "Each question shown individually — respondent taps Next to advance"}
                          {mode === "all_at_once" && "All questions visible in a single scrollable form — drag to arrange side-by-side"}
                          {mode === "pages" && "Group questions into pages — drag to arrange within and across pages"}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Form layout editor — shown for all_at_once and pages */}
              {cfg.pagination !== "one_at_a_time" && questions.length > 0 && (
                <FormLayoutEditor
                  questions={questions}
                  pageGroups={cfg.page_groups ?? questions.map((q) => [[q.id]])}
                  pagination={cfg.pagination}
                  onChange={(groups) => setPageGroups(activeViewTab, groups)}
                  onAddPage={() => addPage(activeViewTab)}
                  onRemovePage={(i) => removePage(activeViewTab, i)}
                />
              )}

              {/* Read-only preview for one_at_a_time */}
              {cfg.pagination === "one_at_a_time" && questions.length > 0 && (
                <div style={{ paddingTop: 4 }}>
                  <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>Question order preview</label>
                  <div style={{ display: "grid", gap: 6 }}>
                    {questions.map((q, i) => (
                      <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", background: "var(--gg-filter-bg, rgba(37,99,235,0.03))" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, minWidth: 20, color: "var(--gg-text, inherit)" }}>{i + 1}</span>
                        <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--gg-text, inherit)" }}>{q.question_text || "Untitled question"}</span>
                        <span style={{ fontSize: 11, opacity: 0.4, color: "var(--gg-text, inherit)" }}>{q.question_type}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.5, margin: "8px 0 0", color: "var(--gg-text, inherit)" }}>Reorder by dragging questions in the list above.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Danger zone ── */}
      {surveyId && (
        <div style={{ marginTop: 8, paddingTop: 24, borderTop: "1px solid var(--gg-border, #e5e7eb)", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleDeleteSurvey}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8,
              border: "1px solid #fca5a5", background: "transparent",
              color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            <Trash2 size={14} /> Delete Survey
          </button>
        </div>
      )}
    </section>
  );
}

// ── Form Layout Editor (DnD) ──────────────────────────────────────────────────
// page_groups is pages × rows × questionIds. Each row can have 1 or 2 IDs.
// Drag a card between rows to reorder; drag onto another card to pair side-by-side.

type DragInfo = { qId: string; pageIdx: number; rowIdx: number; slotIdx: number };

function cardHeight(qType: string, optionCount: number): number {
  if (qType === "text") return 72;
  if (["multiple_choice", "multiple_select", "multiple_choice_with_other", "multiple_select_with_other"].includes(qType)) {
    return optionCount >= 4 ? 56 : 44;
  }
  if (qType === "yes_no" || qType === "rating") return 44;
  return 36; // text_short, email, phone, number, date
}

function FormLayoutEditor({
  questions,
  pageGroups,
  pagination,
  onChange,
  onAddPage,
  onRemovePage,
}: {
  questions: LocalQuestion[];
  pageGroups: string[][][];
  pagination: PaginationMode;
  onChange: (groups: string[][][]) => void;
  onAddPage: () => void;
  onRemovePage: (pageIdx: number) => void;
}) {
  const [dragging, setDragging] = useState<DragInfo | null>(null);
  const [dropTarget, setDropTarget] = useState<{ pageIdx: number; rowIdx: number; side: "above" | "below" | "left" | "right" } | null>(null);
  const qMap = new Map(questions.map((q) => [q.id, q]));

  // Ensure all questions are in page_groups (append missing ones as solo rows to last page)
  const normalizedGroups: string[][][] = pageGroups.length > 0 ? pageGroups.map(p => p.map(r => [...r])) : [[]];
  const inGroups = new Set(normalizedGroups.flat(2));
  const missing = questions.filter(q => !inGroups.has(q.id));
  if (missing.length > 0) {
    normalizedGroups[normalizedGroups.length - 1].push(...missing.map(q => [q.id]));
  }

  function applyDrop(target: NonNullable<typeof dropTarget>) {
    if (!dragging) return;
    const groups = normalizedGroups.map(p => p.map(r => [...r]));

    // Remove dragged question from its current position
    const srcPage = groups[dragging.pageIdx];
    if (!srcPage) return;
    const srcRow = srcPage[dragging.rowIdx];
    if (!srcRow) return;
    srcRow.splice(dragging.slotIdx, 1);
    if (srcRow.length === 0) srcPage.splice(dragging.rowIdx, 1);

    const { pageIdx, rowIdx, side } = target;
    const tPage = groups[pageIdx];
    if (!tPage) return;

    if (side === "left" || side === "right") {
      // Pair with existing card in this row (max 2)
      const tRow = tPage[rowIdx];
      if (tRow && tRow.length < 2) {
        if (side === "left") tRow.unshift(dragging.qId);
        else tRow.push(dragging.qId);
      } else {
        // Row full — insert as new row above/below
        tPage.splice(rowIdx + (side === "right" ? 1 : 0), 0, [dragging.qId]);
      }
    } else {
      // Insert as new solo row above or below rowIdx
      const insertAt = side === "above" ? rowIdx : rowIdx + 1;
      tPage.splice(insertAt, 0, [dragging.qId]);
    }

    onChange(groups.filter(p => p.length > 0));
  }

  function onDragStart(e: React.DragEvent, info: DragInfo) {
    e.dataTransfer.effectAllowed = "move";
    setDragging(info);
  }

  function onDragOver(e: React.DragEvent, target: NonNullable<typeof dropTarget>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  }

  function onDrop(e: React.DragEvent, target: NonNullable<typeof dropTarget>) {
    e.preventDefault();
    applyDrop(target);
    setDragging(null);
    setDropTarget(null);
  }

  function onDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  const isDropTarget = (p: number, r: number, s: "above" | "below" | "left" | "right") =>
    dropTarget?.pageIdx === p && dropTarget.rowIdx === r && dropTarget.side === s;

  const dropZoneLine = (p: number, r: number, side: "above" | "below"): React.CSSProperties => ({
    height: 4, borderRadius: 2, margin: side === "above" ? "0 0 4px" : "4px 0 0",
    background: isDropTarget(p, r, side) ? "var(--gg-primary, #2563eb)" : "transparent",
    transition: "background 0.1s",
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {normalizedGroups.map((page, pageIdx) => (
        <div key={pageIdx} style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 10, overflow: "hidden" }}>
          {/* Page header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--gg-filter-bg, rgba(37,99,235,0.04))" }}>
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text, inherit)" }}>
              {pagination === "pages" ? `Page ${pageIdx + 1} — ` : ""}{page.flat().length} question{page.flat().length !== 1 ? "s" : ""}
            </span>
            {pagination === "pages" && normalizedGroups.length > 1 && (
              <button type="button" onClick={() => onRemovePage(pageIdx)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, opacity: 0.5, color: "#dc2626" }}>
                Remove page
              </button>
            )}
          </div>

          {/* Rows */}
          <div style={{ padding: "10px 14px", display: "grid", gap: 2 }}
            onDragOver={(e) => { e.preventDefault(); }}
          >
            {page.length === 0 && (
              <div style={{ padding: "20px 0", fontSize: 13, opacity: 0.4, textAlign: "center", color: "var(--gg-text, inherit)" }}>
                Drag questions here
              </div>
            )}
            {page.map((row, rowIdx) => (
              <div key={rowIdx}>
                {/* Drop zone above */}
                <div
                  style={dropZoneLine(pageIdx, rowIdx, "above")}
                  onDragOver={(e) => onDragOver(e, { pageIdx, rowIdx, side: "above" })}
                  onDrop={(e) => onDrop(e, { pageIdx, rowIdx, side: "above" })}
                />

                {/* Row of 1 or 2 cards */}
                <div style={{ display: "flex", gap: 6 }}>
                  {row.map((qId, slotIdx) => {
                    const q = qMap.get(qId);
                    const h = cardHeight(q?.question_type ?? "text_short", q?.options?.length ?? 0);
                    const isDraggingThis = dragging?.qId === qId;
                    return (
                      <div
                        key={qId}
                        style={{ flex: 1, position: "relative" }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const side = x < rect.width / 2 ? "left" : "right";
                          if (row.length < 2 || (row.length === 2 && side === (slotIdx === 0 ? "left" : "right"))) {
                            // only highlight side if it would pair, not if row is already full on that side
                          }
                          onDragOver(e, { pageIdx, rowIdx, side });
                        }}
                        onDrop={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const side: "left" | "right" = x < rect.width / 2 ? "left" : "right";
                          onDrop(e, { pageIdx, rowIdx, side });
                        }}
                      >
                        {/* Left pair drop indicator */}
                        {isDropTarget(pageIdx, rowIdx, "left") && slotIdx === 0 && row.length < 2 && (
                          <div style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 3, borderRadius: 2, background: "var(--gg-primary, #2563eb)", zIndex: 2 }} />
                        )}
                        {/* Right pair drop indicator */}
                        {isDropTarget(pageIdx, rowIdx, "right") && slotIdx === row.length - 1 && row.length < 2 && (
                          <div style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 3, borderRadius: 2, background: "var(--gg-primary, #2563eb)", zIndex: 2 }} />
                        )}
                        <div
                          draggable
                          onDragStart={(e) => onDragStart(e, { qId, pageIdx, rowIdx, slotIdx })}
                          onDragEnd={onDragEnd}
                          style={{
                            height: h,
                            borderRadius: 8,
                            border: `1.5px solid ${isDraggingThis ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                            background: isDraggingThis ? "color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent)" : "var(--gg-filter-bg, rgba(37,99,235,0.02))",
                            display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
                            cursor: "grab", opacity: isDraggingThis ? 0.5 : 1,
                            transition: "border-color 0.1s, background 0.1s",
                            overflow: "hidden",
                          }}
                        >
                          <span style={{ fontSize: 11, opacity: 0.3, userSelect: "none", flexShrink: 0 }}>⠿</span>
                          <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--gg-text, inherit)" }}>
                            {q ? (q.question_text?.slice(0, 40) || "Untitled") : qId}
                          </span>
                          <span style={{ fontSize: 10, opacity: 0.35, flexShrink: 0, color: "var(--gg-text, inherit)" }}>
                            {q?.question_type?.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Drop zone below (only on last row to avoid double zones) */}
                {rowIdx === page.length - 1 && (
                  <div
                    style={dropZoneLine(pageIdx, rowIdx, "below")}
                    onDragOver={(e) => onDragOver(e, { pageIdx, rowIdx, side: "below" })}
                    onDrop={(e) => onDrop(e, { pageIdx, rowIdx, side: "below" })}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {pagination === "pages" && (
        <button
          type="button"
          onClick={onAddPage}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 8, border: "1px dashed var(--gg-border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--gg-text-dim, #6b7280)" }}
        >
          <Plus size={14} /> Add Page
        </button>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)",
  fontSize: 14,
  background: "transparent",
  boxSizing: "border-box",
  color: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "inherit",
};

/** Solid primary action button — used for Save, primary CTAs */
const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 20px", borderRadius: 8, fontWeight: 700, border: "none",
  cursor: "pointer", fontSize: 14,
  background: "var(--gg-primary, #2563eb)", color: "white",
};

/** Ghost/outlined secondary button — used for Preview, Copy URL, Add choice, etc. */
const ghostBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
  padding: "7px 14px", borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "transparent", cursor: "pointer", fontWeight: 500,
  color: "var(--gg-text, inherit)", textDecoration: "none",
};

// ── Question type metadata ────────────────────────────────────────────────────

const QUESTION_TYPE_META: Record<string, { label: string }> = {
  multiple_choice:            { label: "Multiple Choice" },
  multiple_choice_with_other: { label: "Choice + Other" },
  multiple_select:            { label: "Multi-Select" },
  multiple_select_with_other: { label: "Multi-Select + Other" },
  text:                       { label: "Long Text" },
  text_short:                 { label: "Short Text" },
  yes_no:                     { label: "Yes / No" },
  date:                       { label: "Date" },
  rating:                     { label: "Rating" },
  number:                     { label: "Number" },
  email:                      { label: "Email" },
  phone:                      { label: "Phone" },
  product_picker:             { label: "Product Picker" },
};

// ── CRM Field Picker ──────────────────────────────────────────────────────────

type SchemaEntry = { column: string; label: string; data_type?: string; table?: string; is_join?: boolean };

const COMMON_FIELDS: Record<string, SchemaEntry[]> = {
  people: [
    // Contact
    { column: "first_name",     label: "First Name",          data_type: "text" },
    { column: "last_name",      label: "Last Name",           data_type: "text" },
    { column: "email",          label: "Email",               data_type: "text" },
    { column: "phone",          label: "Phone (primary)",     data_type: "text" },
    { column: "phone_cell",     label: "Phone (cell)",        data_type: "text" },
    { column: "phone_landline", label: "Phone (landline)",    data_type: "text" },
    // Basic
    { column: "birth_date",     label: "Date of Birth",       data_type: "date" },
    { column: "gender",         label: "Gender",              data_type: "text" },
    { column: "occupation",     label: "Occupation",          data_type: "text" },
    { column: "notes",          label: "Notes",               data_type: "text" },
    // Political
    { column: "party",          label: "Party",               data_type: "text" },
    { column: "top_issues",     label: "Top Political Issues",data_type: "text[]" },
    { column: "votes_history.2024_presidential_general", label: "2024 Pres. General — Who they voted for", data_type: "text" },
    { column: "votes_history.2024_presidential_primary", label: "2024 Pres. Primary — Who they voted for", data_type: "text" },
    { column: "votes_history.2020_presidential_general", label: "2020 Pres. General — Who they voted for", data_type: "text" },
    { column: "votes_history.2020_presidential_primary", label: "2020 Pres. Primary — Who they voted for", data_type: "text" },
    { column: "votes_history.2016_presidential_general", label: "2016 Pres. General — Who they voted for", data_type: "text" },
    { column: "votes_history.2016_presidential_primary", label: "2016 Pres. Primary — Who they voted for", data_type: "text" },
    // Demographics
    { column: "ethnicity",      label: "Ethnicity",           data_type: "text" },
    { column: "language",       label: "Language",            data_type: "text" },
    { column: "marital_status", label: "Marital Status",      data_type: "text" },
    { column: "education_level",label: "Education Level",     data_type: "text" },
    { column: "income_range",   label: "Income Range",        data_type: "text" },
    { column: "religion",       label: "Religion",            data_type: "text" },
  ],
  tenant_people: [
    { column: "contact_types",    label: "Contact Types (append)",  data_type: "text[]" },
    { column: "notes",            label: "Tenant Notes",            data_type: "text" },
    { column: "priority",         label: "Priority",                data_type: "text" },
    { column: "volunteer_status", label: "Volunteer Status",        data_type: "text" },
    { column: "source",           label: "Source (how they found us)", data_type: "text" },
  ],
  locations: [
    { column: "address_line1",  label: "Street Address",      data_type: "text" },
    { column: "city",           label: "City",                data_type: "text" },
    { column: "state",          label: "State",               data_type: "text" },
    { column: "postal_code",    label: "ZIP Code",            data_type: "text" },
    { column: "unit",           label: "Unit / Apt",          data_type: "text" },
  ],
  opportunities: [
    { column: "title",             label: "Title",              data_type: "text" },
    { column: "stage",             label: "Stage",              data_type: "text" },
    { column: "pipeline",          label: "Pipeline",           data_type: "text" },
    { column: "amount_cents",      label: "Amount (cents)",     data_type: "integer" },
    { column: "priority",          label: "Priority",           data_type: "text" },
    { column: "channel",           label: "Channel",            data_type: "text" },
    { column: "how_heard",         label: "How They Heard",     data_type: "text" },
    { column: "referred_by",       label: "Referred By",        data_type: "text" },
    { column: "message",           label: "Message",            data_type: "text" },
    { column: "notes",             label: "Notes",              data_type: "text" },
    { column: "delivery_location", label: "Delivery Location",  data_type: "text" },
    { column: "frequency",         label: "Frequency",          data_type: "text" },
    { column: "recurring",         label: "Recurring",          data_type: "boolean" },
    { column: "paid",              label: "Paid",               data_type: "boolean" },
    { column: "delivery_date",     label: "Delivery Date",      data_type: "date" },
    { column: "due_at",            label: "Due At",             data_type: "timestamp" },
  ],
  households: [
    { column: "name",           label: "Household Name",      data_type: "text" },
  ],
  companies: [
    { column: "name",           label: "Company Name",        data_type: "text" },
    { column: "phone",          label: "Phone",               data_type: "text" },
    { column: "email",          label: "Email",               data_type: "text" },
    { column: "industry",       label: "Industry",            data_type: "text" },
    { column: "domain",         label: "Domain",              data_type: "text" },
  ],
};

const TABLE_LABELS: Record<string, string> = {
  people: "People",
  tenant_people: "Person (Tenant Fields)",
  locations: "Location",
  opportunities: "Opportunity",
  households: "Household",
  companies: "Company",
};

function normalizeCrmFieldClient(raw: string): { table: string; column: string } {
  const idx = raw.indexOf(".");
  return idx >= 0 ? { table: raw.slice(0, idx), column: raw.slice(idx + 1) } : { table: "people", column: raw };
}

function getFieldLabel(value: string | null, schema?: Record<string, SchemaEntry[]>): string {
  if (!value) return "(No mapping)";
  const { table, column } = normalizeCrmFieldClient(value);
  const tableLabel = TABLE_LABELS[table] ?? table;
  // Search common fields first
  const common = COMMON_FIELDS[table]?.find((f) => f.column === column);
  if (common) return `${tableLabel} › ${common.label}`;
  // Search advanced schema
  if (schema) {
    const adv = schema[table]?.find((f) => f.column === column);
    if (adv) return `${tableLabel} › ${adv.label}`;
  }
  return `${tableLabel} › ${column}`;
}

function CrmFieldPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeTable, setActiveTable] = useState<string | null>(null); // null = record type list
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSchema, setAdvancedSchema] = useState<Record<string, SchemaEntry[]>>({});
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Keep dropdown anchored to trigger even when page scrolls
  useEffect(() => {
    if (!open) return;
    function update() {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function openPicker() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    if (value) {
      const { table } = normalizeCrmFieldClient(value);
      setActiveTable(table);
    } else {
      setActiveTable(null);
    }
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setActiveTable(null);
  }

  function loadAdvanced() {
    if (advancedLoading || Object.keys(advancedSchema).length > 0) return;
    setAdvancedLoading(true);
    Promise.all(
      ["people", "locations", "opportunities", "households", "companies"].map((t) =>
        fetch(`/api/crm/schema?table=${t}`)
          .then((r) => r.json())
          .then((cols: { column: string; label: string }[]) => [t, cols.map((c) => ({ ...c, table: t }))] as [string, SchemaEntry[]])
      )
    )
      .then((entries) => setAdvancedSchema(Object.fromEntries(entries)))
      .catch(() => {})
      .finally(() => setAdvancedLoading(false));
  }

  const displaySchema = showAdvanced && Object.keys(advancedSchema).length > 0 ? advancedSchema : null;
  const TABLE_ORDER = ["people", "tenant_people", "locations", "opportunities", "households", "companies"];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        style={{
          ...inputStyle,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "left",
          color: value ? "var(--gg-text, inherit)" : "var(--gg-text-dim, #9ca3af)",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {getFieldLabel(value, advancedSchema)}
        </span>
        <ChevronRight size={13} style={{ flexShrink: 0, opacity: 0.4, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.12s" }} />
      </button>
      {typeof document !== "undefined" && open && rect && createPortal(
        <>
          {/* Click-away overlay — closes picker when clicking outside dropdown */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9990 }}
            onMouseDown={closePicker}
          />
          {/* Dropdown panel — above the overlay */}
          <div
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: Math.max(rect.width, 240),
              zIndex: 9999,
              background: "var(--gg-card, white)",
              border: "1px solid var(--gg-border, #e5e7eb)",
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              maxHeight: 320,
            }}
          >
            {activeTable === null ? (
              // ── Level 1: Record type list ──
              <>
                {value && (
                  <button
                    type="button"
                    onClick={() => { onChange(null); closePicker(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", borderBottom: "1px solid var(--gg-border, #e5e7eb)", cursor: "pointer", fontSize: 13, opacity: 0.55, background: "transparent", color: "var(--gg-text, inherit)" }}
                  >
                    ✕ Remove mapping
                  </button>
                )}
                {TABLE_ORDER.map((tKey) => {
                  const norm = value ? normalizeCrmFieldClient(value) : null;
                  const hasSelection = norm?.table === tKey;
                  const selLabel = hasSelection
                    ? ((displaySchema ?? COMMON_FIELDS)[tKey] ?? []).find((f) => f.column === norm!.column)?.label ?? norm!.column
                    : null;
                  return (
                    <button
                      key={tKey}
                      type="button"
                      onClick={() => setActiveTable(tKey)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", textAlign: "left", padding: "10px 14px",
                        border: "none", borderBottom: "1px solid var(--gg-border, #e5e7eb)",
                        cursor: "pointer", fontSize: 13, background: "transparent",
                        color: "var(--gg-text, inherit)",
                      }}
                    >
                      <span style={{ fontWeight: hasSelection ? 600 : 500, color: hasSelection ? "var(--gg-primary, #2563eb)" : "inherit" }}>
                        {TABLE_LABELS[tKey]}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {selLabel && <span style={{ fontSize: 11, opacity: 0.55 }}>{selLabel}</span>}
                        <ChevronRight size={13} style={{ opacity: 0.35 }} />
                      </span>
                    </button>
                  );
                })}
                <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", cursor: "pointer", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                  <input
                    type="checkbox"
                    checked={showAdvanced}
                    style={{ width: 13, height: 13, cursor: "pointer" }}
                    onChange={(e) => {
                      setShowAdvanced(e.target.checked);
                      if (e.target.checked) loadAdvanced();
                    }}
                  />
                  Show advanced fields{advancedLoading ? " — Loading…" : ""}
                </label>
              </>
            ) : (
              // ── Level 2: Field list for chosen record type ──
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid var(--gg-border, #e5e7eb)", background: "var(--gg-filter-bg, rgba(37,99,235,0.03))" }}>
                  <button type="button" onClick={() => setActiveTable(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--gg-primary, #2563eb)", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                    ← <span style={{ fontWeight: 700 }}>{TABLE_LABELS[activeTable]}</span>
                  </button>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {((displaySchema ?? COMMON_FIELDS)[activeTable] as SchemaEntry[] ?? [])
                    .filter((f) => !f.is_join)
                    .map((f) => {
                      const fieldVal = `${activeTable}.${f.column}`;
                      const isSelected = value
                        ? (() => { const n = normalizeCrmFieldClient(value); return n.table === activeTable && n.column === f.column; })()
                        : false;
                      return (
                        <button key={f.column} type="button"
                          onClick={() => { onChange(isSelected ? null : fieldVal); closePicker(); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            width: "100%", textAlign: "left",
                            padding: "8px 14px", border: "none", borderBottom: "1px solid var(--gg-border, #e5e7eb)",
                            cursor: "pointer", fontSize: 13,
                            background: isSelected ? "rgba(37,99,235,0.08)" : "transparent",
                            color: isSelected ? "var(--gg-primary, #2563eb)" : "var(--gg-text, inherit)",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          <span>{f.label}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {f.data_type && (
                              <span style={{
                                fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 4,
                                background: "rgba(0,0,0,0.06)", color: "var(--gg-text-dim, #6b7280)",
                                fontFamily: "monospace",
                              }}>{f.data_type}</span>
                            )}
                            {isSelected && <span style={{ opacity: 0.6 }}>✓</span>}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── Opportunity Title Template Editor ────────────────────────────────────────

const OPP_TEMPLATE_VARS: { token: string; label: string }[] = [
  { token: "{{last_name}}",     label: "Last Name" },
  { token: "{{first_name}}",    label: "First Name" },
  { token: "{{name}}",          label: "Full Name" },
  { token: "{{date}}",          label: "Date" },
  { token: "{{email}}",         label: "Email" },
  { token: "{{survey}}",        label: "Survey Name" },
  { token: "{{amount}}",        label: "Amount" },
  { token: "{{company}}",       label: "Company" },
  { token: "{{phone}}",         label: "Phone" },
  { token: "{{channel}}",       label: "Channel" },
];

function OppTitleTemplateEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function insertToken(token: string) {
    const el = inputRef.current;
    if (!el) { onChange(value + token); return; }
    const start = el.selectionStart ?? value.length;
    const end   = el.selectionEnd   ?? value.length;
    const next  = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ ...labelStyle, display: "block" }}>Opportunity title template</label>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, fontSize: 13 }}
        placeholder="{{last_name}} — {{date}}"
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {OPP_TEMPLATE_VARS.map(({ token, label }) => {
          const active = value.includes(token);
          return (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              title={`Insert ${token}`}
              style={{
                padding: "3px 9px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                cursor: "pointer", border: "1px solid var(--gg-border, #e5e7eb)",
                background: active ? "rgba(37,99,235,0.1)" : "transparent",
                color: active ? "var(--gg-primary, #2563eb)" : "var(--gg-text-dim, #6b7280)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 11, opacity: 0.45 }}>
        Click a tag to insert it at your cursor. Edit the text freely.
      </p>
    </div>
  );
}

// ── Small icon button ─────────────────────────────────────────────────────────

function IconBtn({
  children, onClick, disabled, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "none", background: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "4px 5px", borderRadius: 4, lineHeight: 1,
        opacity: disabled ? 0.25 : 0.55,
        color: danger ? "#dc2626" : "inherit",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

// Export contrastColor for use in other components
export { contrastColor };
