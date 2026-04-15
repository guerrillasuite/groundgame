"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useEffect, useCallback } from "react";
import type { EditorRef, EmailEditorProps } from "react-email-editor";
import MergeTagPanel from "./MergeTagPanel";

// Lazy-load Unlayer — never include in the main bundle
const EmailEditor = dynamic(() => import("react-email-editor"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 600,
        background: "rgb(var(--card-700))",
        border: "1px solid rgb(var(--border-600))",
        borderRadius: 10,
        color: "rgb(var(--text-300))",
        fontSize: 14,
      }}
    >
      Loading editor…
    </div>
  ),
});

export type DesignData = {
  design_json: object;
  html_body: string;
};

type TemplateMeta = {
  id: string;
  name: string;
  created_at: string;
};

interface Props {
  initialDesign?: object | null;
  onExport: (data: DesignData) => void;
  saving: boolean;
}

const MERGE_TAGS = {
  first_name:       { name: "First Name",      value: "{First_Name}" },
  last_name:        { name: "Last Name",        value: "{Last_Name}" },
  full_name:        { name: "Full Name",        value: "{Full_Name}" },
  email:            { name: "Email Address",    value: "{Email}" },
  city:             { name: "City",             value: "{City}" },
  state:            { name: "State",            value: "{State}" },
  person_id:        { name: "Person ID",        value: "{Person_ID}" },
  unsubscribe_link: { name: "Unsubscribe Link", value: "{Unsubscribe_Link}" },
  trackable_link:   { name: "Trackable Link",   value: "{Trackable_Link_URL}" },
};

export default function StepDesign({ initialDesign, onExport, saving }: Props) {
  const editorRef = useRef<EditorRef>(null);
  const [ready, setReady] = useState(false);
  const [hasUnsub, setHasUnsub] = useState(true);

  // Template picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Save-as-template state
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const onReady: EmailEditorProps["onReady"] = (unlayer) => {
    setReady(true);
    if (initialDesign && Object.keys(initialDesign).length > 0) {
      unlayer.loadDesign(initialDesign as Parameters<typeof unlayer.loadDesign>[0]);
    }
  };

  function handleExport() {
    const unlayer = editorRef.current?.editor;
    if (!unlayer) return;
    unlayer.exportHtml((data) => {
      const { design, html } = data;
      setHasUnsub(html.includes("{Unsubscribe_Link}"));
      onExport({ design_json: design, html_body: html });
    });
  }

  function handleInsertTag(tag: string) {
    navigator.clipboard.writeText(tag).catch(() => {});
  }

  // ── Template picker ────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/dispatch/templates");
      const json = await res.json();
      if (res.ok) setTemplates(json.templates ?? []);
    } catch {
      // non-critical
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (pickerOpen) fetchTemplates();
  }, [pickerOpen, fetchTemplates]);

  async function handleLoadTemplate(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/dispatch/templates/${id}`);
      const json = await res.json();
      if (res.ok && json.template?.design_json) {
        const unlayer = editorRef.current?.editor;
        if (unlayer) {
          unlayer.loadDesign(json.template.design_json);
          setPickerOpen(false);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/dispatch/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  // ── Save as template ───────────────────────────────────────────────────────

  function openSaveDialog() {
    setSaveName("");
    setSaveError(null);
    setSavedOk(false);
    setSaveOpen(true);
  }

  async function handleSaveTemplate() {
    if (!saveName.trim()) { setSaveError("Name is required"); return; }
    const unlayer = editorRef.current?.editor;
    if (!unlayer) return;

    setSavingTemplate(true);
    setSaveError(null);

    unlayer.exportHtml(async ({ design, html }) => {
      try {
        const res = await fetch("/api/dispatch/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: saveName.trim(), design_json: design, html_body: html }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to save");
        setSavedOk(true);
        setTimeout(() => setSaveOpen(false), 1200);
      } catch (e: any) {
        setSaveError(e.message);
      } finally {
        setSavingTemplate(false);
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Design Your Email</h2>
          <p style={{ margin: 0, fontSize: 13, color: "rgb(var(--text-300))" }}>
            Drag and drop blocks to build your email. Use merge tags for personalization.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="gg-btn-ghost"
            onClick={() => setPickerOpen(true)}
            disabled={!ready}
            style={{ fontSize: 13 }}
          >
            Load Template
          </button>
          <button
            type="button"
            className="gg-btn-ghost"
            onClick={openSaveDialog}
            disabled={!ready}
            style={{ fontSize: 13 }}
          >
            Save as Template
          </button>
          <button
            type="button"
            className="gg-btn-primary"
            onClick={handleExport}
            disabled={!ready || saving}
          >
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </div>

      {/* Unsub warning */}
      {!hasUnsub && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(251,191,36,0.12)",
            border: "1px solid rgba(251,191,36,0.4)",
            fontSize: 13,
            color: "#fbbf24",
          }}
        >
          ⚠ <strong>No unsubscribe link detected.</strong> Add the{" "}
          <code
            style={{
              background: "rgba(251,191,36,0.2)",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
              color: "#fbbf24",
            }}
          >
            {"{Unsubscribe_Link}"}
          </code>{" "}
          merge tag to your template to comply with email laws.
        </div>
      )}

      {/* Editor + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 210px", gap: 16, alignItems: "start" }}>
        <div
          style={{
            border: "1px solid rgb(var(--border-600))",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <EmailEditor
            ref={editorRef}
            onReady={onReady}
            style={{ minHeight: 640 }}
            options={{
              projectId: 285907,
              displayMode: "email",
              version: "latest",
              mergeTags: MERGE_TAGS,
              appearance: {
                theme: "modern_dark",
                panels: { tools: { dock: "right" } },
              },
              features: { preheaderText: false },
            }}
          />
        </div>

        <div style={{ position: "sticky", top: 80 }}>
          <MergeTagPanel onInsert={handleInsertTag} />
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "rgb(var(--text-300))", lineHeight: 1.5 }}>
            Clicking a tag copies it to your clipboard. Paste it into any text block in the editor.
          </p>
        </div>
      </div>

      {/* ── Template picker modal ─────────────────────────────────────────── */}
      {pickerOpen && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 300,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}
        >
          <div
            style={{
              background: "rgb(var(--card-700))",
              border: "1px solid rgb(var(--border-600))",
              borderRadius: 14,
              padding: 28,
              width: "100%",
              maxWidth: 520,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Load Template</h3>
              <button
                type="button"
                className="gg-btn-ghost"
                onClick={() => setPickerOpen(false)}
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, display: "grid", gap: 8 }}>
              {loadingTemplates ? (
                <p style={{ color: "rgb(var(--text-300))", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
                  Loading…
                </p>
              ) : templates.length === 0 ? (
                <p style={{ color: "rgb(var(--text-300))", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
                  No saved templates yet. Design an email and click "Save as Template".
                </p>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      background: "rgb(var(--surface-800))",
                      border: "1px solid rgb(var(--border-600))",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "rgb(var(--text-300))", marginTop: 2 }}>
                        {new Date(t.created_at).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="gg-btn-primary"
                      onClick={() => handleLoadTemplate(t.id)}
                      disabled={loadingId === t.id}
                      style={{ fontSize: 13, padding: "7px 16px" }}
                    >
                      {loadingId === t.id ? "Loading…" : "Load"}
                    </button>
                    <button
                      type="button"
                      className="gg-btn-danger"
                      onClick={() => handleDeleteTemplate(t.id)}
                      disabled={deletingId === t.id}
                    >
                      {deletingId === t.id ? "…" : "Delete"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Save as template modal ────────────────────────────────────────── */}
      {saveOpen && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 300,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSaveOpen(false); }}
        >
          <div
            style={{
              background: "rgb(var(--card-700))",
              border: "1px solid rgb(var(--border-600))",
              borderRadius: 14,
              padding: 28,
              width: "100%",
              maxWidth: 400,
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 16 }}>Save as Template</h3>

            {savedOk ? (
              <p style={{ color: "#16a34a", fontWeight: 600, fontSize: 14, margin: 0 }}>
                ✓ Template saved!
              </p>
            ) : (
              <>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: "rgb(var(--text-300))",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Template Name
                </label>
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => { setSaveName(e.target.value); setSaveError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
                  placeholder="e.g. Fundraising Header"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 7,
                    border: `1px solid ${saveError ? "rgb(var(--error-600))" : "rgb(var(--border-600))"}`,
                    background: "rgb(var(--surface-800))",
                    color: "rgb(var(--text-100))",
                    fontSize: 14,
                    boxSizing: "border-box",
                    marginBottom: 8,
                  }}
                />
                {saveError && (
                  <p style={{ margin: "0 0 12px", fontSize: 12, color: "rgb(var(--error-600))" }}>
                    {saveError}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className="gg-btn-primary"
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate}
                    style={{ flex: 1 }}
                  >
                    {savingTemplate ? "Saving…" : "Save Template"}
                  </button>
                  <button
                    type="button"
                    className="gg-btn-ghost"
                    onClick={() => setSaveOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
