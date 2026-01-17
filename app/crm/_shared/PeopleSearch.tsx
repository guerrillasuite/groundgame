"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PeopleSearch({ placeholder = "Search…" }: { placeholder?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [v, setV] = useState(sp.get("q") ?? "");

  // Keep input in sync when user clears the URL etc.
  useEffect(() => {
    const now = sp.get("q") ?? "";
    if (now !== v) setV(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (v.trim()) params.set("q", v.trim());
    else params.delete("q");
    router.push(`?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="row" style={{ gap: 8 }}>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="gg-input"
        style={{
          minWidth: 240,
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.04)",
        }}
        aria-label="Search people"
      />
      <button
        type="submit"
        className="gg-btn"
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.18)",
          background: "rgba(255,255,255,.08)",
        }}
      >
        Search
      </button>
      {v ? (
        <button
          type="button"
          onClick={() => {
            setV("");
            const params = new URLSearchParams(sp.toString());
            params.delete("q");
            router.push(`?${params.toString()}`);
          }}
          className="gg-btn"
          aria-label="Clear search"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.12)",
            background: "transparent",
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
