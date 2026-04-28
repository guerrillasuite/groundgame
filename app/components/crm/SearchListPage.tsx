"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FilterSection, {
  type FilterRow,
  NO_VALUE_OPS,
  makeFilterId,
  defaultOp,
} from "@/app/components/crm/FilterSection";
import type { ColumnDef } from "@/app/api/crm/schema/route";

// ── Types ──────────────────────────────────────────────────────────────────

type Column = { key: string; label: string; width?: number };

type Props = {
  title: string;
  searchEndpoint: string;
  columns: Column[];
  target?: "people" | "households" | "locations" | "companies";
  rowHrefPrefix?: string;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  contactTypeOptions?: string[];
  defaultContent?: React.ReactNode;
};

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 5,
  fontSize: 14,
  background: "var(--gg-bg, #fff)",
  color: "var(--gg-text, #111)",
  cursor: "pointer",
};

function cleanFilters(rows: FilterRow[]) {
  return rows
    .filter((r) => r.field && (r.value.trim() || NO_VALUE_OPS.includes(r.op)))
    .map(({ field, op, value, data_type }) => ({ field, op, value, data_type }));
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SearchListPage({
  title,
  searchEndpoint,
  columns,
  target,
  rowHrefPrefix,
  searchPlaceholder = "Search…",
  headerActions,
  contactTypeOptions,
  defaultContent,
}: Props) {
  // ── Quick search state ──
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const lastQuery = useRef("");
  const [mode, setMode] = useState<"search" | "filter">("search");

  // ── Filter schema state ──
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, ColumnDef[]>>({});
  const [tagOpts, setTagOpts] = useState<string[]>([]);
  const [surveyOpts, setSurveyOpts] = useState<string[]>([]);
  const [dynContactTypes, setDynContactTypes] = useState<string[]>([]);

  // ── Per-section filter state ──
  const [peopleFilters, setPeopleFilters] = useState<FilterRow[]>([
    { id: makeFilterId(), field: "first_name", op: "contains", value: "", data_type: "text" },
  ]);
  const [locFilters, setLocFilters] = useState<FilterRow[]>([]);
  const [hhFilters, setHhFilters] = useState<FilterRow[]>([]);
  const [primaryFilters, setPrimaryFilters] = useState<FilterRow[]>([
    { id: makeFilterId(), field: "", op: "contains", value: "", data_type: "text" },
  ]);

  // ── Filter results state ──
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterSearched, setFilterSearched] = useState(false);
  const [filterResults, setFilterResults] = useState<Record<string, any>[]>([]);
  const [filterPage, setFilterPage] = useState(0);

  // ── Export state ──
  const router = useRouter();
  const [showExport, setShowExport] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exportMode, setExportMode] = useState<"call" | "knock" | "both">("call");
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // ── Load schemas when filter mode opens ──
  useEffect(() => {
    if (mode !== "filter" || !target || schemasLoaded) return;

    const tablesToFetch = target === "people"
      ? ["people", "locations", "households"]
      : [target];

    const fetches: Promise<any>[] = tablesToFetch.map((t) =>
      fetch(`/api/crm/schema?table=${t}`).then((r) => r.json()).catch(() => [])
    );
    if (target === "people") {
      fetches.push(fetch("/api/crm/tags").then((r) => r.json()).catch(() => []));
      fetches.push(fetch("/api/crm/settings/contact-types").then((r) => r.json()).catch(() => []));
      fetches.push(fetch("/api/survey").then((r) => r.json()).catch(() => []));
    }

    Promise.all(fetches).then((results) => {
      const newSchemas: Record<string, ColumnDef[]> = {};
      tablesToFetch.forEach((t, i) => {
        if (Array.isArray(results[i]) && results[i].length) newSchemas[t] = results[i];
      });
      setSchemas(newSchemas);

      if (target === "people") {
        const base = tablesToFetch.length;
        const tags = results[base];
        const ctypes = results[base + 1];
        const surveys = results[base + 2];
        if (Array.isArray(tags)) setTagOpts(tags.map((t: any) => t.name).filter(Boolean));
        if (Array.isArray(ctypes)) setDynContactTypes(ctypes.map((t: any) => t.key).filter(Boolean));
        if (Array.isArray(surveys)) setSurveyOpts(surveys.map((s: any) => s.title).filter(Boolean));

        const pSchema = newSchemas["people"] ?? [];
        const first = pSchema.filter((c) => !c.is_join)[0];
        if (first) setPeopleFilters([{ id: makeFilterId(), field: first.column, op: defaultOp(first.data_type), value: "", data_type: first.data_type }]);
      } else {
        const tSchema = newSchemas[target] ?? [];
        const first = tSchema[0];
        if (first) setPrimaryFilters([{ id: makeFilterId(), field: first.column, op: defaultOp(first.data_type), value: "", data_type: first.data_type }]);
      }
      setSchemasLoaded(true);
    }).catch(() => setSchemasLoaded(true));
  }, [mode, target, schemasLoaded]);

  // ── Core search ──
  const doSearch = useCallback(async (q: string, pg: number, pp: number) => {
    setLoading(true);
    setSearched(true);
    lastQuery.current = q;
    try {
      const params = new URLSearchParams();
      params.set("q", q.trim());
      params.set("limit", String(pp));
      params.set("offset", String(pg * pp));
      const res = await fetch(`${searchEndpoint}?${params}`);
      const json = await res.json();
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
      setPage(pg);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchEndpoint]);

  // ── Restore from URL on mount ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q") ?? "";
    const m = sp.get("mode") as "search" | "filter" | null;
    if (m === "filter") setMode("filter");
    if (q) { setQuery(q); doSearch(q, 0, perPage); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync URL ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (mode === "filter") params.set("mode", "filter");
    if (mode === "search" && query) params.set("q", query);
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [mode, query]);

  function handleSearch() { doSearch(query, 0, perPage); }
  function goToPage(pg: number) { doSearch(lastQuery.current, pg, perPage); }
  function changePerPage(pp: number) {
    setPerPage(pp);
    if (searched) doSearch(lastQuery.current, 0, pp);
    setFilterPage(0);
  }

  // ── Run filter ──
  async function runFilter() {
    if (!target) return;
    setFilterLoading(true);
    setFilterSearched(true);
    try {
      const body: any = { target };
      if (target === "people") {
        body.filters = [
          ...cleanFilters(peopleFilters),
          ...cleanFilters(locFilters),
          ...cleanFilters(hhFilters),
        ];
      } else {
        body.filters = cleanFilters(primaryFilters);
      }

      const res = await fetch("/api/crm/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const normalized = (Array.isArray(data) ? data : []).map((item: any) => {
        if (target === "people") return {
          id: item.id,
          name: [item.first_name, item.last_name].filter(Boolean).join(" ") || "—",
          email: item.email ?? "",
          phone: item.phone ?? "",
          contact_type: item.contact_type ?? "",
        };
        if (target === "households") return {
          id: item.id,
          name: item.name ?? "(unnamed)",
          address: [item.address, item.city, item.state, item.postal_code].filter(Boolean).join(", "),
        };
        if (target === "locations") return {
          id: item.id,
          address: [item.address, item.city, item.state, item.postal_code].filter(Boolean).join(", ") || item.address,
        };
        if (target === "companies") return {
          id: item.id,
          name: item.name ?? "(Unnamed)",
          industry: item.industry ?? "",
          domain: item.domain ?? "",
          status: item.status ?? "",
        };
        return item;
      });
      setFilterResults(normalized);
      setFilterPage(0);
    } catch {
      setFilterResults([]);
    } finally {
      setFilterLoading(false);
    }
  }

  // ── Export to list ──
  async function handleExport() {
    if (!exportName.trim() || !target) return;
    setExporting(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/crm/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: exportName.trim(),
          app_mode: exportMode,
          target,
          selected_ids: filterResults.map((r) => r.id),
          user_ids: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create list");
      const warnings = (data.walklists ?? [])
        .filter((w: any) => w.warning)
        .map((w: any) => `${w.name}: ${w.warning}`)
        .join("\n");
      if (warnings) throw new Error(warnings);
      router.push("/crm/lists");
    } catch (err: any) {
      setExportErr(err.message ?? "Failed to create list");
      setExporting(false);
    }
  }

  // ── Pagination ──
  function renderPagination(totalCount: number, pg: number, onPageChange: (n: number) => void) {
    const pages = Math.ceil(totalCount / perPage);
    const start = pg * perPage + 1;
    const end = Math.min((pg + 1) * perPage, totalCount);
    const btn = (disabled: boolean): React.CSSProperties => ({
      padding: "5px 12px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 5,
      background: disabled ? "var(--gg-bg-subtle, #f3f4f6)" : "var(--gg-bg, #fff)",
      color: disabled ? "var(--gg-text-dim, #9ca3af)" : "var(--gg-text, #374151)",
      cursor: disabled ? "default" : "pointer", fontSize: 13,
    });
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>{start}–{end} of {totalCount.toLocaleString()}</span>
        {pages > 1 && <>
          <button style={btn(pg === 0)} disabled={pg === 0} onClick={() => onPageChange(0)}>«</button>
          <button style={btn(pg === 0)} disabled={pg === 0} onClick={() => onPageChange(pg - 1)}>‹ Prev</button>
          <button style={btn(pg >= pages - 1)} disabled={pg >= pages - 1} onClick={() => onPageChange(pg + 1)}>Next ›</button>
          <button style={btn(pg >= pages - 1)} disabled={pg >= pages - 1} onClick={() => onPageChange(pages - 1)}>»</button>
        </>}
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--gg-text-dim, #6b7280)", marginLeft: "auto" }}>
          Per page:
          <select value={perPage} onChange={(e) => changePerPage(Number(e.target.value))} style={{ ...selectStyle, padding: "4px 8px", fontSize: 13 }}>
            {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    );
  }

  function renderTable(displayRows: Record<string, any>[], empty?: React.ReactNode) {
    if (displayRows.length === 0) {
      return (
        <div style={{ border: "1px dashed var(--gg-border, #e5e7eb)", borderRadius: 8, padding: "48px 24px", textAlign: "center", color: "var(--gg-text-dim, #9ca3af)" }}>
          {empty}
        </div>
      );
    }
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--gg-border, #e5e7eb)" }}>
              {columns.map((col) => (
                <th key={col.key} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--gg-text-dim, #6b7280)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", width: col.width ?? undefined }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => rowHrefPrefix ? (
              <tr key={row.id} className="search-list-row">
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: 0, borderBottom: "1px solid var(--gg-border, #f3f4f6)" }}>
                    <Link href={`${rowHrefPrefix}${row.id}?from=search`} style={{ display: "block", padding: "9px 12px", textDecoration: "none", color: "inherit", maxWidth: col.width ?? 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row[col.key] ?? ""}
                    </Link>
                  </td>
                ))}
              </tr>
            ) : (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--gg-border, #f3f4f6)" }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: "9px 12px", maxWidth: col.width ?? 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row[col.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const ctOpts = contactTypeOptions?.length ? contactTypeOptions : dynContactTypes;
  const peopleEnumOpts: Record<string, string[]> = {
    ...(ctOpts.length ? { contact_type: ctOpts } : {}),
    ...(tagOpts.length ? { tags: tagOpts } : {}),
    ...(surveyOpts.length ? { completed_survey: surveyOpts } : {}),
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {headerActions}
      </div>

      {target && (
        <div style={{ display: "flex", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
          {(["search", "filter"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "7px 16px", fontSize: 13,
              fontWeight: mode === m ? 600 : 400,
              background: mode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-bg, #fff)",
              color: mode === m ? "#fff" : "var(--gg-text, #374151)",
              border: "none", cursor: "pointer",
            }}>
              {m === "search" ? "Quick Search" : "Filters"}
            </button>
          ))}
        </div>
      )}

      {/* ── QUICK SEARCH ── */}
      {mode === "search" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder={searchPlaceholder}
              style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, fontSize: 14, background: "var(--gg-bg, #fff)", color: "var(--gg-text, #111)", outline: "none" }}
            />
            <button onClick={handleSearch} disabled={loading} style={{ padding: "8px 20px", background: loading ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          {!searched
            ? (defaultContent ?? null)
            : loading
              ? <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>Searching...</p>
              : rows.length === 0
                ? renderTable([], <p style={{ margin: 0, fontSize: 14 }}>{query.trim() ? `No results for "${query}"` : "No records found."}</p>)
                : <>{renderTable(rows)}{total > 0 && renderPagination(total, page, goToPage)}</>
          }
        </>
      )}

      {/* ── FILTER MODE ── */}
      {mode === "filter" && target && (
        <>
          <div style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, padding: "16px", background: "var(--gg-filter-bg, rgba(37,99,235,0.04))" }}>
            {!schemasLoaded && <p style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)", margin: "0 0 8px" }}>Loading fields…</p>}

            {target === "people" ? (
              <>
                <FilterSection title="People" filters={peopleFilters} schema={schemas["people"] ?? []} onChange={setPeopleFilters} defaultOpen hideJoined dynamicEnumOpts={peopleEnumOpts} groupLabel="Person" />
                <FilterSection title="Location" filters={locFilters} schema={schemas["locations"] ?? []} onChange={setLocFilters} />
                <FilterSection title="Household" filters={hhFilters} schema={schemas["households"] ?? []} onChange={setHhFilters} hideJoined />
              </>
            ) : (
              <FilterSection
                title={target.charAt(0).toUpperCase() + target.slice(1)}
                filters={primaryFilters}
                schema={schemas[target] ?? []}
                onChange={setPrimaryFilters}
                defaultOpen
              />
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
              <button onClick={runFilter} disabled={filterLoading} style={{ padding: "7px 20px", background: filterLoading ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: filterLoading ? "not-allowed" : "pointer", opacity: filterLoading ? 0.7 : 1 }}>
                {filterLoading ? "Searching..." : "Search"}
              </button>
              {filterSearched && !filterLoading && (
                <span style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>
                  {filterResults.length} result{filterResults.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {!filterSearched
            ? renderTable([], <><p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--gg-text, #374151)" }}>Set your filters above</p><p style={{ margin: 0, fontSize: 14 }}>Add one or more conditions, then click Search.</p></>)
            : filterLoading ? null
            : filterResults.length === 0
              ? renderTable([], <p style={{ margin: 0, fontSize: 14 }}>No results matched your filters.</p>)
              : <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>{filterResults.length} result{filterResults.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => { setShowExport((v) => !v); setExportErr(null); }} style={{ padding: "6px 14px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, background: showExport ? "var(--gg-primary, #2563eb)" : "var(--gg-bg, #fff)", color: showExport ? "#fff" : "var(--gg-text, #374151)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Save as List
                    </button>
                  </div>

                  {showExport && (
                    <div style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, padding: 16, background: "var(--gg-filter-bg, rgba(37,99,235,0.04))", display: "flex", flexDirection: "column", gap: 12 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Create list from all {filterResults.length} results</p>
                      <input type="text" value={exportName} onChange={(e) => setExportName(e.target.value)} placeholder="List name…" style={{ padding: "7px 10px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 5, fontSize: 14, background: "var(--gg-bg, #fff)", color: "var(--gg-text, #111)", outline: "none" }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["call", "knock", "both"] as const).map((m) => (
                          <button key={m} onClick={() => setExportMode(m)} style={{ padding: "5px 12px", borderRadius: 5, border: `1px solid ${exportMode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`, background: exportMode === m ? "rgba(37,99,235,0.08)" : "var(--gg-bg, #fff)", color: exportMode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-text-dim, #6b7280)", fontWeight: exportMode === m ? 700 : 400, fontSize: 13, cursor: "pointer" }}>
                            {m === "call" ? "📞 Dials" : m === "knock" ? "🚪 Doors" : "📞🚪 Both"}
                          </button>
                        ))}
                      </div>
                      {exportErr && <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>{exportErr}</p>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={handleExport} disabled={exporting || !exportName.trim()} style={{ padding: "7px 18px", background: exporting || !exportName.trim() ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: exporting || !exportName.trim() ? "not-allowed" : "pointer" }}>
                          {exporting ? "Creating…" : "Create List"}
                        </button>
                        <button onClick={() => setShowExport(false)} style={{ padding: "7px 14px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, background: "var(--gg-bg, #fff)", fontSize: 14, cursor: "pointer", color: "var(--gg-text, #374151)" }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {renderTable(filterResults.slice(filterPage * perPage, (filterPage + 1) * perPage))}
                  {renderPagination(filterResults.length, filterPage, setFilterPage)}
                </>
          }
        </>
      )}

      <style>{`.search-list-row:hover td { background: rgba(59, 130, 246, 0.13); }`}</style>
    </section>
  );
}
