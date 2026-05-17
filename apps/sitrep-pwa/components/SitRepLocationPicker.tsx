"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const S = {
  bg:      "rgb(10 13 20)",
  surface: "rgb(20 25 38)",
  border:  "rgba(255,255,255,.09)",
  text:    "rgb(236 240 245)",
  dim:     "rgb(100 116 139)",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9,
  background: "rgba(255,255,255,.05)", border: `1px solid ${S.border}`,
  color: S.text, fontSize: 13, outline: "none",
};

interface Props {
  tenantId: string;
  locationId:   string | null;
  locationDisplay: string;
  onSelect: (id: string | null, display: string) => void;
}

export default function SitRepLocationPicker({ tenantId, locationId, locationDisplay, onSelect }: Props) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<{ id: string; display: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Debounced search
  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/sitrep/locations?tenantId=${encodeURIComponent(tenantId)}&q=${encodeURIComponent(q)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setResults(Array.isArray(data) ? data : []); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  function openPicker() {
    setOpen(true);
    setQuery("");
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function pick(id: string, display: string) {
    onSelect(id, display);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(null, "");
  }

  // Closed state: show current location or placeholder
  if (!open) {
    // No location set — tap whole row to open picker
    if (!locationDisplay) {
      return (
        <div
          onClick={openPicker}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 12px", borderRadius: 9, cursor: "pointer",
            background: "rgba(255,255,255,.05)", border: `1px solid ${S.border}`,
            color: S.dim, fontSize: 13, minHeight: 38,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Add location</span>
        </div>
      );
    }

    // Location set — address taps open maps, edit button opens picker, × clears
    const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(locationDisplay)}`;
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px", borderRadius: 9,
          background: "rgba(255,255,255,.05)", border: `1px solid ${S.border}`,
          fontSize: 13, minHeight: 38,
        }}
      >
        {/* Pin icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, color: S.dim }}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        {/* Address — tapping opens native maps app chooser */}
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, color: S.text, textDecoration: "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {locationDisplay}
        </a>
        {/* Edit — opens search picker */}
        <button
          onClick={openPicker}
          title="Change location"
          style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        {/* Clear */}
        <button
          onClick={clear}
          title="Remove location"
          style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", padding: "0 2px", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    );
  }

  // Open state: search input + dropdown
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search locations…"
        style={inputStyle}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      {(results.length > 0 || loading) && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: S.surface, border: `1px solid ${S.border}`, borderRadius: 9,
          overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.5)",
        }}>
          {loading && <div style={{ padding: "10px 14px", color: S.dim, fontSize: 12 }}>Searching…</div>}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r.id, r.display)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 14px", background: "none", border: "none",
                borderTop: `1px solid ${S.border}`, color: S.text, fontSize: 13, cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {r.display}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
