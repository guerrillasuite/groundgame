"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import KnockMap from "@/app/components/KnockMap";

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
  geojson: string | null;
  visited: boolean;
  last_result: string | null;
  last_result_at: string | null;
};

function getTenantIdFromBrowser(): string {
  try {
    if (typeof window !== "undefined") {
      const ls =
        localStorage.getItem("tenantId") || localStorage.getItem("tenant_id");
      if (ls) return ls;
      const m1 = document.cookie.match(/(?:^|; )tenantId=([^;]+)/);
      if (m1?.[1]) return decodeURIComponent(m1[1]);
      const m2 = document.cookie.match(/(?:^|; )tenant_id=([^;]+)/);
      if (m2?.[1]) return decodeURIComponent(m2[1]);
    }
  } catch {}
  return "";
}

export default function WalklistKnockView() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [view, setView] = useState<"list" | "map">(
    (sp.get("view") as "list" | "map") || "list"
  );
  const [filter, setFilter] = useState<"all" | "unvisited" | "visited">("all");
  const [resumeIndex, setResumeIndex] = useState<number>(0);

  const tenantId = getTenantIdFromBrowser();
  const resumeKey = `doors:cursor:${tenantId}:${params.id}`;

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc(
        "gs_get_walklist_locations_v2",
        { _walklist_id: params.id }
      );
      if (error) {
        console.error(error);
        return;
      }
      setRows((data ?? []) as Row[]);

      // client resume
      const local = localStorage.getItem(resumeKey);
      if (local) setResumeIndex(Math.max(0, parseInt(local, 10) || 0));

      // server resume via walklist_progress
      const { data: prog } = await supabase
        .from("walklist_progress")
        .select("last_index")
        .eq("walklist_id", params.id)
        .limit(1)
        .maybeSingle();
      if (prog?.last_index != null) {
        setResumeIndex((cur) => Math.max(cur, prog.last_index));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "unvisited") return rows.filter((r) => !r.visited);
    if (filter === "visited") return rows.filter((r) => r.visited);
    return rows;
  }, [rows, filter]);

  const firstUnvisited = useMemo(
    () => (rows ?? []).find((r) => !r.visited)?.idx ?? 0,
    [rows]
  );
  const startIndex = Math.max(resumeIndex, firstUnvisited);
  const startHref = `/doors/${params.id}/${startIndex}`;

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Walklist</h1>
          <p className="opacity-70">
            {(rows?.length ?? 0)} locations • resume at #{startIndex + 1}
          </p>
        </div>
        <Link
          href={startHref}
          className="btn btn-lg"
          data-testid="start-btn"
        >
          ➤ Start knocking
        </Link>
      </header>

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
          }))}
          onMarkerClick={(id) => {
            const r = (rows ?? []).find((x) => x.item_id === id);
            if (r) router.push(`/doors/${params.id}/${r.idx}`);
          }}
        />
      ) : (
        <div className="gg-list">
          {filtered.map((r) => (
            <Link
              key={r.item_id}
              href={`/doors/${params.id}/${r.idx}`}
              className="gg-item gg-item--button"
            >
              <div className="gg-text" style={{ flex: 1 }}>
                <h2>{r.household_name || r.address_line1 || "(Unknown address)"}</h2>
                <p className="opacity-80">
                  {(r.city || "")} {(r.state || "")} {(r.postal_code || "")}
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
      )}
    </main>
  );
}
