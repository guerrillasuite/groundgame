"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";

const S = {
  bg:        "rgb(10 13 20)",
  surface:   "rgb(14 18 28)",
  card:      "rgb(20 25 38)",
  border:    "rgba(255,255,255,.07)",
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 9,
  background: "rgba(255,255,255,.05)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,.1)",
  color: S.text,
  fontSize: 13,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  display: "block",
  marginBottom: 6,
  color: S.dim,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

function focusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor =
    "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  e.currentTarget.style.boxShadow =
    "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
}
function blurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "rgba(255,255,255,.1)";
  e.currentTarget.style.boxShadow = "none";
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

type LocationResult = {
  id: string;
  place_name: string | null;
  common_place_name: string | null;
  full_address: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export type LocationValue =
  | { type: "location"; locationId: string; displayText: string }
  | { type: "url"; url: string }
  | null;

type Props = {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  placeholder?: string;
  mode?: "compact" | "full";
  disabled?: boolean;
};

export default function LocationPicker({
  value,
  onChange,
  placeholder = "Search location or paste URL…",
  mode = "compact",
  disabled = false,
}: Props) {
  const [inputText, setInputText]     = useState("");
  const [results, setResults]         = useState<LocationResult[]>([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [showManual, setShowManual]   = useState(false);
  const [saving, setSaving]           = useState(false);

  // Manual entry form state
  const [mPlaceName, setMPlaceName]   = useState("");
  const [mAddr1, setMAddr1]           = useState("");
  const [mUnit, setMUnit]             = useState("");
  const [mCity, setMCity]             = useState("");
  const [mState, setMState]           = useState("");
  const [mZip, setMZip]               = useState("");
  const [mError, setMError]           = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowManual(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/locations/search?q=${encodeURIComponent(q)}&picker=1`);
      if (res.ok) {
        const data: LocationResult[] = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
        setHighlighted(-1);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  function handleInputChange(raw: string) {
    setInputText(raw);
    const trimmed = raw.trim();

    // URL mode — no search
    if (/^https?:\/\//i.test(trimmed)) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(trimmed), 250);
  }

  function handleInputBlur() {
    const trimmed = inputText.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      onChange({ type: "url", url: trimmed });
      setInputText("");
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const trimmed = inputText.trim();
    if (e.key === "Enter" && /^https?:\/\//i.test(trimmed)) {
      onChange({ type: "url", url: trimmed });
      setInputText("");
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      selectResult(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  function selectResult(r: LocationResult) {
    const primary = r.place_name ?? r.address_line1 ?? "";
    const secondary = [r.city, r.state].filter(Boolean).join(", ");
    const displayText = secondary ? `${primary}, ${secondary}` : primary;
    onChange({ type: "location", locationId: r.id, displayText });
    setInputText("");
    setOpen(false);
    setResults([]);
  }

  async function handleSaveManual() {
    if (!mAddr1.trim() || !mCity.trim() || !mState.trim() || !mZip.trim()) {
      setMError("Address, city, state, and ZIP are required.");
      return;
    }
    setMError("");
    setSaving(true);
    try {
      const res = await fetch("/api/crm/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_line1: mAddr1.trim(),
          unit: mUnit.trim() || undefined,
          city: mCity.trim(),
          state: mState.trim(),
          postal_code: mZip.trim(),
          place_name: mPlaceName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMError(data.error ?? "Failed to save location."); setSaving(false); return; }
      const displayText = [
        data.place_name ?? data.address_line1,
        data.city,
        data.state,
      ].filter(Boolean).join(", ");
      onChange({ type: "location", locationId: data.id, displayText });
      setShowManual(false);
      resetManual();
    } catch { setMError("Network error."); }
    setSaving(false);
  }

  function resetManual() {
    setMPlaceName(""); setMAddr1(""); setMUnit("");
    setMCity(""); setMState(""); setMZip(""); setMError("");
  }

  // If already has a value — show pill
  if (value) {
    const isUrl = value.type === "url";
    const displayText = isUrl ? value.url : value.displayText;
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 8,
          background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
          fontSize: 13, color: S.text, maxWidth: mode === "compact" ? 340 : "100%",
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{isUrl ? "🔗" : "📍"}</span>
          {isUrl ? (
            <a
              href={value.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: S.dimBright, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {displayText}
            </a>
          ) : (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayText}
            </span>
          )}
          {!disabled && (
            <button
              onClick={() => onChange(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
              title="Remove"
            >
              ×
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        onFocus={focusInput}
        style={{ ...inputStyle }}
      />

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "rgba(20,25,38,.97)",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,.45)",
          zIndex: 50,
          overflow: "hidden",
        }}>
          {loading ? (
            // Skeleton shimmer
            [0, 1, 2].map((i) => (
              <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ height: 12, width: `${60 + i * 15}%`, background: "rgba(255,255,255,.08)", borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 10, width: "40%", background: "rgba(255,255,255,.05)", borderRadius: 4 }} />
              </div>
            ))
          ) : results.length > 0 ? (
            <>
              {results.map((r, idx) => {
                const primary = r.place_name ?? r.address_line1 ?? "";
                const secondary = [r.city, r.state, r.postal_code].filter(Boolean).join(", ");
                return (
                  <div
                    key={r.id}
                    onMouseDown={() => selectResult(r)}
                    onMouseEnter={() => setHighlighted(idx)}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid rgba(255,255,255,.06)",
                      cursor: "pointer",
                      background: highlighted === idx ? "rgba(255,255,255,.05)" : "transparent",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 500, color: S.text }}>{primary}</div>
                    {secondary && (
                      <div style={{ fontSize: 12, color: S.dim, marginTop: 2 }}>{secondary}</div>
                    )}
                  </div>
                );
              })}
              <div
                onMouseDown={() => { setOpen(false); setShowManual(true); setInputText(""); }}
                style={{ padding: "10px 14px", cursor: "pointer", color: S.dimBright, fontSize: 13 }}
              >
                Enter address manually →
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: "10px 14px", color: S.dim, fontSize: 13 }}>No locations found</div>
              <div
                onMouseDown={() => { setOpen(false); setShowManual(true); setInputText(""); }}
                style={{ padding: "10px 14px", cursor: "pointer", color: S.dimBright, fontSize: 13, borderTop: "1px solid rgba(255,255,255,.06)" }}
              >
                Enter address manually →
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual entry form */}
      {showManual && (
        <div style={{
          marginTop: 8,
          background: "rgba(20,25,38,.97)",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 10,
          padding: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 14 }}>Add New Location</div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Place Name (optional)</label>
              <input type="text" value={mPlaceName} onChange={(e) => setMPlaceName(e.target.value)}
                placeholder="e.g. City Hall, The Venue" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div>
              <label style={labelStyle}>Address Line 1 *</label>
              <input type="text" value={mAddr1} onChange={(e) => setMAddr1(e.target.value)}
                placeholder="123 Main St" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div>
              <label style={labelStyle}>Unit / Suite (optional)</label>
              <input type="text" value={mUnit} onChange={(e) => setMUnit(e.target.value)}
                placeholder="Apt 4B, Suite 200" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px", gap: 8 }}>
              <div>
                <label style={labelStyle}>City *</label>
                <input type="text" value={mCity} onChange={(e) => setMCity(e.target.value)}
                  placeholder="City" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
              </div>
              <div>
                <label style={labelStyle}>State *</label>
                <select value={mState} onChange={(e) => setMState(e.target.value)}
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
                  <option value="">--</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>ZIP *</label>
                <input type="text" value={mZip} onChange={(e) => setMZip(e.target.value)}
                  placeholder="12345" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
              </div>
            </div>
          </div>

          {mError && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>{mError}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowManual(false); resetManual(); }}
              style={{
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 8, color: S.dim, fontSize: 13, fontWeight: 500,
                padding: "6px 14px", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveManual}
              disabled={saving}
              style={{
                background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
                border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13,
                padding: "8px 18px", cursor: saving ? "not-allowed" : "pointer",
                boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Location"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
