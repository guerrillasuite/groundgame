"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useEffect } from "react";
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
  unsubscribe_link: { name: "Unsubscribe Link", value: "{Unsubscribe_Link}" },
  trackable_link:   { name: "Trackable Link",   value: "{Trackable_Link_URL}" },
};

export default function StepDesign({ initialDesign, onExport, saving }: Props) {
  const editorRef = useRef<EditorRef>(null);
  const [ready, setReady] = useState(false);
  const [hasUnsub, setHasUnsub] = useState(true); // assume ok until we check

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
      const missing = !html.includes("{Unsubscribe_Link}");
      setHasUnsub(!missing);
      if (missing) {
        // Still allow saving — just warn
      }
      onExport({ design_json: design, html_body: html });
    });
  }

  function handleInsertTag(tag: string) {
    // Copy to clipboard — Unlayer doesn't expose a direct insert API on free plan
    navigator.clipboard.writeText(tag).catch(() => {});
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
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
            onClick={handleExport}
            disabled={!ready || saving}
            style={{
              padding: "9px 18px",
              borderRadius: 7,
              border: "none",
              background: !ready || saving ? "rgba(37,99,235,0.35)" : "rgb(var(--primary-600))",
              color: "white",
              fontWeight: 600,
              fontSize: 14,
              cursor: !ready || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </div>

      {!hasUnsub && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(251,191,36,0.12)",
            border: "1px solid #fbbf24",
            fontSize: 13,
            color: "#92400e",
          }}
        >
          ⚠ <strong>No unsubscribe link detected.</strong> Add the{" "}
          <code
            style={{
              background: "rgba(251,191,36,0.2)",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {"{Unsubscribe_Link}"}
          </code>{" "}
          merge tag to your template to comply with email laws.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 210px", gap: 16, alignItems: "start" }}>
        {/* Unlayer editor */}
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
              features: {
                preheaderText: false, // handled in Step 1
              },
            }}
          />
        </div>

        {/* Merge tag panel */}
        <div style={{ position: "sticky", top: 80 }}>
          <MergeTagPanel onInsert={handleInsertTag} />
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 11,
              color: "rgb(var(--text-300))",
              lineHeight: 1.5,
            }}
          >
            Clicking a tag copies it to your clipboard. Paste it into any text block in the editor.
          </p>
        </div>
      </div>
    </div>
  );
}
