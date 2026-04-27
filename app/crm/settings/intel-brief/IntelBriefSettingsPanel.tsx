"use client";

import { useState, useTransition } from "react";
import { CATEGORY_PALETTE, colorHex } from "@/lib/intel-brief-colors";

interface Category {
  key: string;
  label: string;
  color: string;
}

interface Settings {
  keywords: string[];
  display_threshold: number;
  widget_count: number;
  news_feed_enabled_for_field: boolean;
  blacklisted_domains: string[];
  categories: Category[];
}

const DEFAULTS: Settings = {
  keywords: [],
  display_threshold: 6.5,
  widget_count: 5,
  news_feed_enabled_for_field: true,
  blacklisted_domains: [],
  categories: [
    { key: "candidate", label: "Candidate", color: "blue" },
    { key: "opposition", label: "Opposition", color: "red" },
    { key: "policy", label: "Policy", color: "green" },
    { key: "media", label: "Media", color: "purple" },
    { key: "economy", label: "Economy", color: "orange" },
    { key: "national", label: "National", color: "gray" },
  ],
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface Props {
  initialSettings: Record<string, unknown> | null;
}

export default function IntelBriefSettingsPanel({ initialSettings }: Props) {
  const init: Settings = {
    keywords: (initialSettings?.keywords as string[]) ?? DEFAULTS.keywords,
    display_threshold: (initialSettings?.display_threshold as number) ?? DEFAULTS.display_threshold,
    widget_count: (initialSettings?.widget_count as number) ?? DEFAULTS.widget_count,
    news_feed_enabled_for_field: (initialSettings?.news_feed_enabled_for_field as boolean) ?? DEFAULTS.news_feed_enabled_for_field,
    blacklisted_domains: (initialSettings?.blacklisted_domains as string[]) ?? DEFAULTS.blacklisted_domains,
    categories: (initialSettings?.categories as Category[]) ?? DEFAULTS.categories,
  };

  const [settings, setSettings] = useState<Settings>(init);
  const [keywordsRaw, setKeywordsRaw] = useState(init.keywords.join("\n"));
  const [domainsRaw, setDomainsRaw] = useState(init.blacklisted_domains.join("\n"));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Category editor state
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState("blue");
  const [editingColor, setEditingColor] = useState<string | null>(null); // category key being color-edited

  function update<K extends keyof Settings>(key: K, val: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: val }));
    setSaved(false);
  }

  function addCategory() {
    const label = newCatLabel.trim();
    if (!label) return;
    const key = slugify(label);
    if (settings.categories.some((c) => c.key === key)) return;
    update("categories", [...settings.categories, { key, label, color: newCatColor }]);
    setNewCatLabel("");
    setNewCatColor("blue");
  }

  function removeCategory(key: string) {
    update("categories", settings.categories.filter((c) => c.key !== key));
  }

  function setCategoryColor(key: string, color: string) {
    update("categories", settings.categories.map((c) => c.key === key ? { ...c, color } : c));
    setEditingColor(null);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const body: Settings = {
        ...settings,
        keywords: keywordsRaw.split("\n").map((k) => k.trim()).filter(Boolean),
        blacklisted_domains: domainsRaw.split("\n").map((d) => d.trim()).filter(Boolean),
      };
      const res = await fetch("/api/crm/intel-brief/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Failed to save");
      } else {
        setSaved(true);
      }
    });
  }

  const card: React.CSSProperties = {
    background: "var(--gg-card,white)",
    border: "1px solid var(--gg-border,#e5e7eb)",
    borderRadius: 12, padding: "20px 22px", marginBottom: 20,
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700,
    color: "var(--gg-text-dim,#6b7280)", textTransform: "uppercase",
    letterSpacing: ".06em", marginBottom: 6,
  };
  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "8px 12px", borderRadius: 7,
    border: "1px solid var(--gg-border,#d1d5db)",
    fontSize: 14, background: "var(--gg-bg,#f9fafb)",
    color: "var(--gg-text,#111)",
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📡 Intel Brief Settings</h1>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: "9px 22px", borderRadius: 8, border: "none", cursor: "pointer",
            background: saved ? "#22c55e" : "var(--gg-primary,#2563eb)", color: "white",
            fontSize: 14, fontWeight: 700, transition: "background .2s",
          }}
        >
          {isPending ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.1)", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Keywords */}
      <div style={card}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Keywords</p>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--gg-text-dim,#6b7280)" }}>
          One keyword or phrase per line. Articles matching these score higher.
        </p>
        <textarea
          value={keywordsRaw}
          onChange={(e) => { setKeywordsRaw(e.target.value); setSaved(false); }}
          rows={7}
          placeholder={"candidate name\ncounty name\ncampaign issue\nlocal ballot measure"}
          style={{ ...input, resize: "vertical", lineHeight: 1.6 }}
        />
      </div>

      {/* Display threshold & widget count */}
      <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <span style={label}>Display Threshold</span>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--gg-text-dim,#9ca3af)" }}>
            Only show articles scoring ≥ this value
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range" min={1} max={10} step={0.5}
              value={settings.display_threshold}
              onChange={(e) => update("display_threshold", parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--gg-primary,#2563eb)", minWidth: 32, textAlign: "right" }}>
              {settings.display_threshold}
            </span>
          </div>
        </div>
        <div>
          <span style={label}>Dashboard Widget Count</span>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--gg-text-dim,#9ca3af)" }}>
            Articles shown on the main dashboard
          </p>
          <input
            type="number" min={1} max={20}
            value={settings.widget_count}
            onChange={(e) => update("widget_count", parseInt(e.target.value) || 5)}
            style={{ ...input, width: 80 }}
          />
        </div>
      </div>

      {/* Field access toggle */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 700 }}>Show in Field App</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim,#6b7280)" }}>
            Let field operatives see Intel Brief from the PWA dashboard
          </p>
        </div>
        <button
          onClick={() => update("news_feed_enabled_for_field", !settings.news_feed_enabled_for_field)}
          style={{
            width: 48, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
            background: settings.news_feed_enabled_for_field ? "#22c55e" : "#d1d5db",
            position: "relative", transition: "background .2s", flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: settings.news_feed_enabled_for_field ? 24 : 3,
            width: 20, height: 20, borderRadius: "50%", background: "white",
            transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          }} />
        </button>
      </div>

      {/* Categories */}
      <div style={card}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Categories</p>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--gg-text-dim,#6b7280)" }}>
          The AI uses these category names to tag articles. Drag to reorder, click the color dot to change.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {settings.categories.map((c) => {
            const hex = colorHex(c.color);
            return (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Color picker trigger */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setEditingColor(editingColor === c.key ? null : c.key)}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: hex, border: "2px solid white",
                      boxShadow: "0 0 0 1px rgba(0,0,0,.15)", cursor: "pointer",
                    }}
                    title="Change color"
                  />
                  {editingColor === c.key && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", left: 0,
                      background: "var(--gg-card,white)",
                      border: "1px solid var(--gg-border,#e5e7eb)",
                      borderRadius: 10, padding: 10,
                      display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6,
                      zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,.15)",
                      width: 176,
                    }}>
                      {Object.entries(CATEGORY_PALETTE).map(([name, { hex: h, label: l }]) => (
                        <button
                          key={name}
                          onClick={() => setCategoryColor(c.key, name)}
                          title={l}
                          style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: h, border: c.color === name ? "2px solid #1e293b" : "2px solid white",
                            boxShadow: "0 0 0 1px rgba(0,0,0,.1)", cursor: "pointer",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <span style={{
                  flex: 1, fontSize: 14, fontWeight: 600, color: "var(--gg-text,#111)",
                }}>
                  {c.label}
                  <span style={{ fontSize: 11, color: "var(--gg-text-dim,#9ca3af)", marginLeft: 6 }}>
                    ({c.key})
                  </span>
                </span>
                <button
                  onClick={() => removeCategory(c.key)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                  title="Remove"
                >×</button>
              </div>
            );
          })}
        </div>

        {/* Add new category */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="New category name"
            style={{ ...input, flex: 1 }}
          />
          {/* Inline color swatch for new category */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setEditingColor(editingColor === "__new__" ? null : "__new__")}
              style={{
                width: 34, height: 34, borderRadius: 7,
                background: colorHex(newCatColor),
                border: "1px solid var(--gg-border,#d1d5db)", cursor: "pointer",
              }}
              title="Pick color"
            />
            {editingColor === "__new__" && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", right: 0,
                background: "var(--gg-card,white)",
                border: "1px solid var(--gg-border,#e5e7eb)",
                borderRadius: 10, padding: 10,
                display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6,
                zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,.15)",
                width: 176,
              }}>
                {Object.entries(CATEGORY_PALETTE).map(([name, { hex: h, label: l }]) => (
                  <button
                    key={name}
                    onClick={() => { setNewCatColor(name); setEditingColor(null); }}
                    title={l}
                    style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: h, border: newCatColor === name ? "2px solid #1e293b" : "2px solid white",
                      boxShadow: "0 0 0 1px rgba(0,0,0,.1)", cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            onClick={addCategory}
            style={{
              padding: "7px 16px", borderRadius: 7, border: "none",
              background: "var(--gg-primary,#2563eb)", color: "white",
              fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Blacklisted domains */}
      <div style={card}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Blocked Sources</p>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--gg-text-dim,#6b7280)" }}>
          One domain per line. Articles from these sources will be ignored.
        </p>
        <textarea
          value={domainsRaw}
          onChange={(e) => { setDomainsRaw(e.target.value); setSaved(false); }}
          rows={4}
          placeholder={"example.com\ntabloidnews.net"}
          style={{ ...input, resize: "vertical", lineHeight: 1.6 }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: "10px 28px", borderRadius: 8, border: "none", cursor: "pointer",
            background: saved ? "#22c55e" : "var(--gg-primary,#2563eb)", color: "white",
            fontSize: 15, fontWeight: 700, transition: "background .2s",
          }}
        >
          {isPending ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
