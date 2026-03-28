"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import StopModal from "@/app/components/StopModal";
const KnockMap = dynamic(() => import("@/app/components/KnockMap"), {
  ssr: false,
  loading: () => <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>Loading map…</div>,
});

type Row = {
  idx: number;
  item_id: string;
  location_id: string;
  lat: number | null;
  lng: number | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  household_id: string | null;
  household_name: string | null;
  primary_person_id: string | null;
  primary_person_name: string | null;
  visited: boolean;
  last_result: string | null;
  last_result_at: string | null;
};

export default function WalklistKnockView() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false); // set true in effect (client-only) to avoid SSR hydration mismatch
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">(
    (sp.get("view") as "list" | "map") || "list"
  );
  const [filter, setFilter] = useState<"all" | "unvisited" | "visited">("all");
  const [resumeIndex, setResumeIndex] = useState<number>(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);
  const [showStopModal, setShowStopModal] = useState(false);

  const resumeKey = `doors:cursor:${params.id}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    (async () => {
      // Try SQLite cache first (fast when warm)
      let data: Row[] = [];
      try {
        const res = await fetch(`/api/doors/${params.id}/locations`);
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) data = [...json];
      } catch {}

      // Fall back to direct Supabase client (uses browser session + tenant header)
      // Paginate with .range() to bypass PostgREST 1000-row cap
      if (data.length === 0) {
        try {
          const all: Row[] = [];
          let from = 0;
          const chunkSize = 1000;
          while (true) {
            const { data: rpc, error } = await supabase
              .rpc("gs_get_walklist_locations_v2", { _walklist_id: params.id })
              .range(from, from + chunkSize - 1);
            if (error) throw error;
            if (!rpc?.length) break;
            all.push(...(rpc as Row[]));
            if (rpc.length < chunkSize) break;
            from += chunkSize;
          }
          data = all;
        } catch (error: any) {
          if (!cancelled) {
            setLoadErr(`Supabase error ${error.code}: ${error.message}`);
            setLoading(false);
          }
          return;
        }
      }

      if (cancelled) return;
      // Force plain JS array — Supabase may return a response object that passes
      // Array.isArray but lacks standard Array.prototype methods in some builds.
      setRows(data.length > 0 ? [...data] : []);
      setLoading(false);

      // Resume from localStorage
      try {
        const local = localStorage.getItem(resumeKey);
        if (local) setResumeIndex(Math.max(0, parseInt(local, 10) || 0));
      } catch {}

      // Background sync to warm the SQLite cache
      fetch("/api/doors/sync", { method: "POST" }).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [params.id, resumeKey]);

  const filtered = useMemo(() => {
    setPage(0);
    if (!Array.isArray(rows)) return [];
    if (filter === "unvisited") return rows.filter((r) => !r.visited);
    if (filter === "visited") return rows.filter((r) => r.visited);
    return rows;
  }, [rows, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * perPage, (safePage + 1) * perPage);
  const pageStart = filtered.length === 0 ? 0 : safePage * perPage + 1;
  const pageEnd = Math.min((safePage + 1) * perPage, filtered.length);

  const firstUnvisited = useMemo(
    () => Array.isArray(rows) ? (rows.find((r) => !r.visited)?.idx ?? 0) : 0,
    [rows]
  );
  const startIndex = Math.max(resumeIndex, firstUnvisited);
  const startHref = `/doors/${params.id}/${startIndex}`;

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl p-6 text-center opacity-70 border border-dashed mt-8">
          Loading locations…
        </div>
      </main>
    );
  }

  if (loadErr) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 mt-8 text-sm">
          <strong>Failed to load locations</strong>
          <p className="mt-1 opacity-80">{loadErr}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Walklist</h1>
          <p className="opacity-70">
            {(rows?.length ?? 0)} locations • resume at #{startIndex + 1}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowStopModal(true)}
            style={{
              background: "none",
              border: "1px solid var(--gg-border, #22283a)",
              borderRadius: 8, padding: "6px 12px",
              fontSize: 13, cursor: "pointer", color: "inherit",
            }}
          >
            + Stop
          </button>
          <Link href={startHref} className="btn btn-lg" data-testid="start-btn">
            ➤ Start knocking
          </Link>
        </div>
      </header>

      {showStopModal && (
        <StopModal
          channel="doors"
          mode={{ type: "walklist", walklist_id: params.id }}
          onSaved={(opts) => {
            setShowStopModal(false);
            if (opts?.idx !== undefined) {
              router.push(`/doors/${params.id}/${opts.idx}`);
            }
          }}
          onClose={() => setShowStopModal(false)}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="tabs" role="tablist" aria-label="View">
          <button
            role="tab"
            className={`tab ${view === "list" ? "active" : ""}`}
            onClick={() => {
              setView("list");
              router.replace(`?view=list`);
            }}
          >
            List
          </button>
          <button
            role="tab"
            className={`tab ${view === "map" ? "active" : ""}`}
            onClick={() => {
              setView("map");
              router.replace(`?view=map`);
            }}
          >
            Map
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label="Filter">
          <button
            role="tab"
            className={`tab ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            role="tab"
            className={`tab ${filter === "unvisited" ? "active" : ""}`}
            onClick={() => setFilter("unvisited")}
          >
            Unvisited
          </button>
          <button
            role="tab"
            className={`tab ${filter === "visited" ? "active" : ""}`}
            onClick={() => setFilter("visited")}
          >
            Visited
          </button>
        </div>
      </div>

      {view === "map" ? (
        <KnockMap
          points={(filtered ?? []).map((r) => ({
            id: r.item_id,
            lat: r.lat ?? 0,
            lng: r.lng ?? 0,
            label: r.household_name || r.address_line1 || "Unknown",
            visited: r.visited,
            result: r.last_result ?? undefined,
          }))}
          onMarkerClick={(id) => {
            const r = (rows ?? []).find((x) => x.item_id === id);
            if (r) router.push(`/doors/${params.id}/${r.idx}`);
          }}
        />
      ) : (
        <>
          <div className="gg-list">
            {pageRows.map((r) => (
              <Link
                key={r.item_id}
                href={`/doors/${params.id}/${r.idx}`}
                className="gg-item gg-item--button"
              >
                <div className="gg-text" style={{ flex: 1 }}>
                  {r.primary_person_name && (
                    <h2>{r.primary_person_name}</h2>
                  )}
                  <p className={r.primary_person_name ? "opacity-80" : undefined} style={!r.primary_person_name ? { fontWeight: 600 } : undefined}>
                    {[r.address_line1, r.city, r.state, r.postal_code].filter(Boolean).join(", ") || "(Unknown address)"}
                  </p>
                  {r.last_result ? (
                    <p className="opacity-60 text-sm">Last: {r.last_result}</p>
                  ) : null}
                </div>
                <span aria-hidden>›</span>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="gg-item">
                <div className="gg-text">No locations.</div>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.6 }}>
              {filtered.length === 0 ? "0 results" : `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${filtered.length.toLocaleString()}`}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 13, background: "var(--gg-card, white)" }}
              >
                {[25, 50, 100, 250, 500].map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              {([
                [safePage === 0, () => setPage(0), "«"],
                [safePage === 0, () => setPage(safePage - 1), "‹"],
                [safePage >= totalPages - 1, () => setPage(safePage + 1), "›"],
                [safePage >= totalPages - 1, () => setPage(totalPages - 1), "»"],
              ] as [boolean, () => void, string][]).map(([disabled, onClick, label]) => (
                <button
                  key={label}
                  disabled={disabled}
                  onClick={onClick}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--gg-border, #e5e7eb)", background: "var(--gg-card, white)", color: disabled ? "var(--gg-text-dim, #9ca3af)" : "inherit", cursor: disabled ? "default" : "pointer", fontSize: 13 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
