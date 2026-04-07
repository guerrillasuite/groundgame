"use client";

import { useEffect, useRef, useState } from "react";
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
  | "phone";

type DisplayFormat = "list" | "dropdown" | null;

type CrmField = "first_name" | "last_name" | "email" | "phone" | "phone_cell" | "phone_landline";

type LocalQuestion = {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  display_format: DisplayFormat;
  crm_field: CrmField | null;
  required: boolean;
  order_index: number;
  isNew: boolean;
};

type ViewType = "embedded" | "hosted" | "door" | "call" | "text";
type PaginationMode = "one_at_a_time" | "all_at_once" | "pages";

type ViewConfig = {
  pagination: PaginationMode;
  page_groups: string[][] | null; // arrays of question IDs per page
  columns: 1 | 2;
};

type CrmUser = { id: string; name: string; email: string };

// Types that have a "list vs dropdown" display format toggle
const CHOICE_TYPES: QuestionType[] = [
  "multiple_choice", "multiple_choice_with_other",
  "multiple_select", "multiple_select_with_other",
];

const DEFAULT_VIEW_CONFIGS: Record<ViewType, ViewConfig> = {
  embedded: { pagination: "one_at_a_time", page_groups: null, columns: 1 },
  hosted:   { pagination: "one_at_a_time", page_groups: null, columns: 1 },
  door:     { pagination: "one_at_a_time", page_groups: null, columns: 1 },
  call:     { pagination: "one_at_a_time", page_groups: null, columns: 1 },
  text:     { pagination: "all_at_once",   page_groups: null, columns: 1 },
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
    question_type: "multiple_choice",
    options: ["", ""],
    display_format: null,
    crm_field: null,
    required: true,
    order_index,
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
  const [publicSlug, setPublicSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);

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

        const qs: LocalQuestion[] = (data.questions ?? []).map((q: any) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type as QuestionType,
          options: q.options ?? [],
          display_format: q.display_format ?? null,
          crm_field: q.crm_field ?? null,
          required: Boolean(q.required),
          order_index: q.order_index,
          isNew: false,
        }));
        setQuestions(qs);

        // Load view configs
        const cfgs: Record<ViewType, ViewConfig> = { ...DEFAULT_VIEW_CONFIGS };
        for (const vc of data.viewConfigs ?? []) {
          cfgs[vc.view_type as ViewType] = {
            pagination: vc.pagination,
            page_groups: vc.page_groups ?? null,
            columns: (vc.columns as 1 | 2) ?? 1,
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

  // Load embeddable surveys for post-submit picker (once, when Advanced Options opens)
  useEffect(() => {
    if (!showAdvanced || embeddableSurveys.length > 0) return;
    fetch("/api/survey?channel=embedded")
      .then((r) => r.json())
      .then((list: { id: string; title: string }[]) => {
        // Exclude the current survey itself
        setEmbeddableSurveys(list.filter((s) => s.id !== surveyId));
      })
      .catch(() => {});
  }, [showAdvanced, surveyId, embeddableSurveys.length]);

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
    // Remove from view config page_groups
    setViewConfigs((prev) => {
      const next = { ...prev };
      for (const vt of Object.keys(next) as ViewType[]) {
        if (next[vt].page_groups) {
          next[vt] = {
            ...next[vt],
            page_groups: next[vt].page_groups!.map((pg) => pg.filter((qId) => qId !== id)).filter((pg) => pg.length > 0),
          };
        }
      }
      return next;
    });
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

  function initPageGroups(vt: ViewType) {
    // Start with all questions in page 1
    updateViewConfig(vt, { page_groups: [questions.map((q) => q.id)] });
  }

  function addPage(vt: ViewType) {
    setViewConfigs((prev) => {
      const cfg = prev[vt];
      const groups = cfg.page_groups ?? [questions.map((q) => q.id)];
      return { ...prev, [vt]: { ...cfg, page_groups: [...groups, []] } };
    });
  }

  function removePage(vt: ViewType, pageIdx: number) {
    setViewConfigs((prev) => {
      const cfg = prev[vt];
      if (!cfg.page_groups || cfg.page_groups.length <= 1) return prev;
      const groups = [...cfg.page_groups];
      const removed = groups.splice(pageIdx, 1)[0];
      // Move removed questions to the previous page (or first page)
      const targetIdx = Math.max(0, pageIdx - 1);
      if (groups[targetIdx]) {
        groups[targetIdx] = [...groups[targetIdx], ...removed];
      }
      return { ...prev, [vt]: { ...cfg, page_groups: groups } };
    });
  }

  function moveQuestionPage(vt: ViewType, qId: string, direction: "up" | "down") {
    setViewConfigs((prev) => {
      const cfg = prev[vt];
      if (!cfg.page_groups) return prev;
      const groups = cfg.page_groups.map((g) => [...g]);
      let fromPage = -1;
      let fromIdx = -1;
      for (let i = 0; i < groups.length; i++) {
        const j = groups[i].indexOf(qId);
        if (j >= 0) { fromPage = i; fromIdx = j; break; }
      }
      if (fromPage < 0) return prev;
      const toPage = direction === "up" ? fromPage - 1 : fromPage + 1;
      if (toPage < 0 || toPage >= groups.length) return prev;
      groups[fromPage].splice(fromIdx, 1);
      groups[toPage].push(qId);
      return { ...prev, [vt]: { ...cfg, page_groups: groups } };
    });
  }

  function getQuestionPage(vt: ViewType, qId: string): number {
    const groups = viewConfigs[vt].page_groups;
    if (!groups) return 0;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].includes(qId)) return i;
    }
    return groups.length - 1;
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
          question_type: q.question_type,
          options: q.options.filter((o) => o.trim()),
          display_format: q.display_format ?? null,
          crm_field: q.crm_field ?? null,
          required: q.required,
          order_index: q.order_index,
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
            columns: cfg.columns ?? 1,
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
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
              padding: "8px 14px", borderRadius: 8,
              border: "1px solid var(--gg-border, #e5e7eb)",
              color: "var(--gg-text, inherit)", textDecoration: "none", fontWeight: 500,
            }}
          >
            Preview <ExternalLink size={13} />
          </a>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px", borderRadius: 8, fontWeight: 700, border: "none",
            cursor: saving ? "not-allowed" : "pointer", fontSize: 14,
            background: saveStatus === "saved" ? "#22c55e" : saveStatus === "error" ? "#ef4444" : "var(--gg-primary, #2563eb)",
            color: "white",
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
            {(["embedded","hosted","doors","dials","texts","all"] as const).map((ch) => {
              const isAll = ch === "all";
              const checked = isAll
                ? ["embedded","hosted","doors","dials","texts"].every(c => activeChannels.has(c))
                : activeChannels.has(ch);
              const label: Record<string, string> = { embedded: "Embedded", hosted: "Hosted", doors: "Doors", dials: "Dials", texts: "Texts", all: "All" };
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
                        if (e.target.checked) {
                          ["embedded","hosted","doors","dials","texts"].forEach(c => next.add(c));
                        } else {
                          next.clear();
                        }
                      } else {
                        if (e.target.checked) next.add(ch);
                        else next.delete(ch);
                      }
                      setActiveChannels(next);
                    }}
                  />
                  {label[ch]}
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
                      style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, padding: "6px 10px", background: "none", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", color: "var(--gg-text, inherit)" }}
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
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={labelStyle}>Map to CRM field <span style={{ fontWeight: 400, opacity: 0.55 }}>(optional)</span></label>
                    <select
                      value={q.crm_field ?? ""}
                      onChange={(e) => updateQuestion(q.id, { crm_field: (e.target.value || null) as CrmField | null })}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      <option value="">(No mapping)</option>
                      <option value="first_name">First Name</option>
                      <option value="last_name">Last Name</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone (primary)</option>
                      <option value="phone_cell">Phone (cell)</option>
                      <option value="phone_landline">Phone (landline)</option>
                    </select>
                    {q.crm_field && (
                      <p style={{ margin: 0, fontSize: 12, opacity: 0.55 }}>
                        Answers will be used to find or create a CRM contact record via the standard dedupe logic.
                      </p>
                    )}
                  </div>

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
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
                          padding: "6px 10px", borderRadius: 6,
                          background: "var(--gg-filter-bg, rgba(37,99,235,0.04))",
                          border: "1px solid var(--gg-border, #e5e7eb)",
                          cursor: "pointer", width: "fit-content", fontWeight: 500,
                          color: "var(--gg-text, inherit)",
                        }}
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
                          if (mode === "pages" && !cfg.page_groups) {
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
                          {mode === "all_at_once" && "All questions visible in a single scrollable form"}
                          {mode === "pages" && "Group questions into pages — e.g. 5+5 for a 10-question survey"}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Side-by-side columns — only for embedded/hosted, and only when showing multiple questions */}
              {(activeViewTab === "embedded" || activeViewTab === "hosted") && cfg.pagination !== "one_at_a_time" && (
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                  <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>
                    Column layout
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {([1, 2] as const).map((n) => (
                      <label key={n} style={{
                        display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14,
                        padding: "8px 16px", borderRadius: 8, border: `2px solid ${cfg.columns === n ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                        background: cfg.columns === n ? "color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent)" : "transparent",
                        fontWeight: cfg.columns === n ? 600 : 400, color: "var(--gg-text, inherit)",
                        transition: "all 0.1s",
                      }}>
                        <input
                          type="radio"
                          name={`columns-${activeViewTab}`}
                          checked={cfg.columns === n}
                          onChange={() => updateViewConfig(activeViewTab, { columns: n })}
                          style={{ display: "none" }}
                        />
                        {n === 1 ? "Single column" : "Two columns (side by side)"}
                      </label>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.5, color: "var(--gg-text, inherit)", margin: "6px 0 0" }}>
                    Two columns places questions in a 2-up grid — best for short questions like name, email, and phone.
                  </p>
                </div>
              )}

              {/* Custom pages editor */}
              {cfg.pagination === "pages" && (
                <PageGroupsEditor
                  questions={questions}
                  pageGroups={cfg.page_groups ?? [questions.map((q) => q.id)]}
                  onAddPage={() => addPage(activeViewTab)}
                  onRemovePage={(i) => removePage(activeViewTab, i)}
                  onMoveQuestion={(qId, dir) => moveQuestionPage(activeViewTab, qId, dir)}
                  getQuestionPage={(qId) => getQuestionPage(activeViewTab, qId)}
                  totalPages={(cfg.page_groups ?? [questions.map((q) => q.id)]).length}
                />
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

// ── Page Groups Editor ────────────────────────────────────────────────────────

function PageGroupsEditor({
  questions,
  pageGroups,
  onAddPage,
  onRemovePage,
  onMoveQuestion,
  getQuestionPage,
  totalPages,
}: {
  questions: LocalQuestion[];
  pageGroups: string[][];
  onAddPage: () => void;
  onRemovePage: (pageIdx: number) => void;
  onMoveQuestion: (qId: string, dir: "up" | "down") => void;
  getQuestionPage: (qId: string) => number;
  totalPages: number;
}) {
  // Build map of qId → question for quick lookup
  const qMap = new Map(questions.map((q) => [q.id, q]));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {pageGroups.map((group, pageIdx) => (
        <div
          key={pageIdx}
          style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 10, overflow: "hidden" }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px",
            background: "var(--gg-filter-bg, rgba(37,99,235,0.04))",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text, inherit)" }}>
              Page {pageIdx + 1} — {group.length} question{group.length !== 1 ? "s" : ""}
            </span>
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => onRemovePage(pageIdx)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, opacity: 0.5, color: "#dc2626" }}
                title="Remove page (questions move to previous page)"
              >
                Remove page
              </button>
            )}
          </div>
          {group.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 13, opacity: 0.4, textAlign: "center", color: "var(--gg-text, inherit)" }}>
              No questions on this page
            </div>
          ) : (
            <div style={{ padding: "8px 14px", display: "grid", gap: 6 }}>
              {group.map((qId) => {
                const q = qMap.get(qId);
                const pageIdx2 = getQuestionPage(qId);
                return (
                  <div key={qId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: q ? 1 : 0.4, color: "var(--gg-text, inherit)" }}>
                      {q ? (q.question_text || "Untitled question") : `(deleted: ${qId})`}
                    </span>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <IconBtn title="Move to previous page" disabled={pageIdx2 === 0} onClick={() => onMoveQuestion(qId, "up")}><ChevronUp size={12} /></IconBtn>
                      <IconBtn title="Move to next page" disabled={pageIdx2 === totalPages - 1} onClick={() => onMoveQuestion(qId, "down")}><ChevronDown size={12} /></IconBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={onAddPage}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "10px", borderRadius: 8,
          border: "1px dashed var(--gg-border, #e5e7eb)",
          background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600,
          color: "var(--gg-text-dim, #6b7280)",
        }}
      >
        <Plus size={14} /> Add Page
      </button>
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
};

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
