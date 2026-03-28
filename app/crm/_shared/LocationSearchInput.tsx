"use client";

import { useEffect, useRef, useState } from "react";

type LocationResult = {
  id: string;
  address: string;
};

type Value =
  | { type: "existing"; id: string; address: string }
  | { type: "new"; address: string };

type Props = {
  value?: Value | null;
  onChange: (v: Value | null) => void;
  placeholder?: string;
};

export default function LocationSearchInput({
  value,
  onChange,
  placeholder = "Type an address…",
}: Props) {
  const [query, setQuery] = useState(value?.address ?? "");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function search(q: string) {
    setQuery(q);
    onChange(null);
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/locations/search?q=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json();
        setResults(Array.isArray(data?.rows) ? data.rows : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }

  function pick(r: LocationResult) {
    setQuery(r.address);
    setOpen(false);
    onChange({ type: "existing", id: r.id, address: r.address });
  }

  function useNew() {
    const addr = query.trim();
    if (!addr) return;
    setOpen(false);
    onChange({ type: "new", address: addr });
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => search(e.target.value)}
        onFocus={() => { if (results.length > 0 || query.trim()) setOpen(true); }}
        autoComplete="off"
        style={{ width: "100%" }}
      />
      {loading && (
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5, fontSize: 12 }}>
          …
        </span>
      )}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--gg-card, #10131b)",
            border: "1px solid var(--gg-border, #22283a)",
            borderRadius: 8,
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 13,
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                borderBottom: "1px solid var(--gg-border, #22283a)",
              }}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
            >
              {r.address}
            </button>
          ))}
          {query.trim() && (
            <button
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 13,
                background: "none",
                border: "none",
                color: "var(--gg-primary, #2563eb)",
                cursor: "pointer",
              }}
              onMouseDown={(e) => { e.preventDefault(); useNew(); }}
            >
              + Use "{query.trim()}" (create new location)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
