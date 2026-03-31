"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  /** Dynamic contact type options from the tenant's configuration */
  contactTypeOptions?: string[];
};

type FilterOp =
  | "contains" | "equals" | "starts_with" | "not_contains"
  | "is_empty" | "not_empty" | "greater_than" | "gte" | "less_than" | "lte"
  | "is_true" | "is_false" | "in_list" | "not_in_list";

type FilterRow = { id: number; field: string; op: FilterOp; value: string; data_type: string };

type SchemaCol = {
  column: string;
  label: string;
  data_type: string;
  is_join: boolean;
  table?: string;
};

// ── Operator config ────────────────────────────────────────────────────────

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains",     label: "contains" },
  { value: "equals",       label: "equals" },
  { value: "in_list",      label: "is any of" },
  { value: "not_in_list",  label: "is none of" },
  { value: "starts_with",  label: "starts with" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty",     label: "is empty" },
  { value: "not_empty",    label: "is not empty" },
];

const NUM_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals",       label: "=" },
  { value: "greater_than", label: ">" },
  { value: "gte",          label: "≥" },
  { value: "less_than",    label: "<" },
  { value: "lte",          label: "≤" },
  { value: "is_empty",     label: "is empty" },
  { value: "not_empty",    label: "is not empty" },
];

const ENUM_OPTIONS: Record<string, string[]> = {
  party:            ["DEM", "REP", "IND", "NPA", "LIB", "GRN", "OTH"],
  gender:           ["M", "F", "U"],
  voter_status:     ["Active", "Inactive"],
  contact_type:     ["voter", "volunteer", "donor", "staff", "other"],
  voting_frequency: ["frequent", "occasional", "infrequent", "rare"],
  ethnicity:        ["White", "Black", "Hispanic", "Asian", "Native American", "Other", "Unknown"],
  marital_status:   ["Single", "Married", "Divorced", "Widowed", "Unknown"],
  education_level:  ["Less than High School", "High School", "Some College", "College", "Graduate"],
  income_range:     ["<25k", "25-50k", "50-75k", "75-100k", "100-150k", "150k+"],
  absentee_type:    ["mail", "early", "in-person"],
  home_dwelling_type: ["Single Family", "Multi Family", "Condo", "Apartment", "Mobile Home"],
  urbanicity:       ["urban", "suburban", "rural"],
  street_parity:    ["odd", "even"],
  state:            ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"],
};

const BOOL_OPS: { value: FilterOp; label: string }[] = [
  { value: "is_true",  label: "is true" },
  { value: "is_false", label: "is false" },
];

const NUMERIC_TYPES = new Set([
  "integer", "int", "int2", "int4", "int8",
  "bigint", "smallint", "numeric", "decimal",
  "real", "float4", "float8", "double precision",
]);

function isNumericType(type: string) { return NUMERIC_TYPES.has(type); }

function opsForType(type: string) {
  if (type === "boolean") return BOOL_OPS;
  if (isNumericType(type)) return NUM_OPS;
  return TEXT_OPS;
}

function defaultOp(type: string): FilterOp {
  if (type === "boolean") return "is_true";
  if (isNumericType(type)) return "equals";
  return "contains";
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 5,
  fontSize: 14,
  background: "var(--gg-bg, #fff)",
  color: "var(--gg-text, #111)",
  cursor: "pointer",
};

// ── Main component ─────────────────────────────────────────────────────────

let _rowId = 0;

export default function SearchListPage({
  title,
  searchEndpoint,
  columns,
  target,
  rowHrefPrefix,
  searchPlaceholder = "Search…",
  headerActions,
  contactTypeOptions,
}: Props) {
  // Merge dynamic contact type options into ENUM_OPTIONS at render time
  const enumOptions = contactTypeOptions?.length
    ? { ...ENUM_OPTIONS, contact_type: contactTypeOptions }
    : ENUM_OPTIONS;
  // ── State ──
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode, setMode] = useState<"search" | "filter">("search");

  const [schema, setSchema] = useState<SchemaCol[]>([]);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([
    { id: ++_rowId, field: "", op: "contains", value: "", data_type: "text" },
  ]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterSearched, setFilterSearched] = useState(false);
  const [filterResults, setFilterResults] = useState<Record<string, any>[]>([]);
  const [filterPage, setFilterPage] = useState(0);

  // ── Export to list state ──
  const router = useRouter();
  const [showExport, setShowExport] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exportMode, setExportMode] = useState<"call" | "knock" | "both">("call");
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // ── Restore URL query on mount ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    if (q) setQuery(q);
  }, []);

  // ── Load schema for filter mode ──
  useEffect(() => {
    if (mode !== "filter" || !target || schema.length > 0) return;
    fetch(`/api/crm/schema?table=${target}`)
      .then((r) => r.json())
      .then((cols: SchemaCol[]) => {
        setSchema(cols);
        if (cols.length > 0) {
          setFilterRows([{
            id: ++_rowId,
            field: cols[0].column,
            op: defaultOp(cols[0].data_type),
            value: "",
            data_type: cols[0].data_type,
          }]);
        }
      })
      .catch(() => {});
  }, [mode, target, schema.length]);

  // ── Quick-search ──
  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`${searchEndpoint}?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
      setPage(0);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchEndpoint]);

  // ── Sync URL ──
  useEffect(() => {
    if (mode !== "search" || typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [mode, query]);

  // ── Debounced search trigger ──
  useEffect(() => {
    if (mode !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { doSearch(query); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mode, query, doSearch]);

  // ── Filter row helpers ──
  function getSchemaCol(fieldName: string) {
    return schema.find((c) => c.column === fieldName);
  }

  function addFilterRow() {
    const first = schema[0];
    setFilterRows((prev) => [...prev, {
      id: ++_rowId,
      field: first?.column ?? "",
      op: defaultOp(first?.data_type ?? "text"),
      value: "",
      data_type: first?.data_type ?? "text",
    }]);
  }

  function removeFilterRow(id: number) {
    setFilterRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateFilterRow(id: number, patch: Partial<FilterRow>) {
    setFilterRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      if (patch.field && patch.field !== r.field) {
        const col = getSchemaCol(patch.field);
        next.op = defaultOp(col?.data_type ?? "text");
        next.value = "";
        next.data_type = col?.data_type ?? "text";
      }
      return next;
    }));
  }

  async function runFilter() {
    if (!target) return;
    setFilterLoading(true);
    setFilterSearched(true);
    try {
      const validFilters = filterRows
        .filter((r) => r.field)
        .map((r) => ({ field: r.field, op: r.op, value: r.value, data_type: r.data_type }));
      const res = await fetch("/api/crm/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, filters: validFilters }),
      });
      const data = await res.json();
      const normalized = (Array.isArray(data) ? data : []).map((item: any) => {
        if (target === "people") {
          return {
            id: item.id,
            name: [item.first_name, item.last_name].filter(Boolean).join(" ") || "—",
            email: item.email ?? "",
            phone: item.phone ?? "",
            contact_type: item.contact_type ?? "",
          };
        }
        if (target === "households") {
          return {
            id: item.id,
            name: item.name ?? "(unnamed)",
            address: [item.address, item.city, item.state, item.postal_code].filter(Boolean).join(", "),
          };
        }
        if (target === "locations") {
          return {
            id: item.id,
            address: [item.address, item.city, item.state, item.postal_code].filter(Boolean).join(", ") || item.address,
          };
        }
        if (target === "companies") {
          return {
            id: item.id,
            name: item.name ?? "(Unnamed)",
            industry: item.industry ?? "",
            domain: item.domain ?? "",
            status: item.status ?? "",
          };
        }
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
  function renderPagination(totalCount: number, pg: number, setPg: (n: number) => void) {
    const pages = Math.ceil(totalCount / perPage);
    const start = pg * perPage + 1;
    const end = Math.min((pg + 1) * perPage, totalCount);
    const btnStyle = (disabled: boolean): React.CSSProperties => ({
      padding: "5px 12px",
      border: "1px solid var(--gg-border, #e5e7eb)",
      borderRadius: 5,
      background: disabled ? "var(--gg-bg-subtle, #f3f4f6)" : "var(--gg-bg, #fff)",
      color: disabled ? "var(--gg-text-dim, #9ca3af)" : "var(--gg-text, #374151)",
      cursor: disabled ? "default" : "pointer",
      fontSize: 13,
    });
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
          {start}–{end} of {totalCount}
        </span>
        {pages > 1 && <>
          <button style={btnStyle(pg === 0)} disabled={pg === 0} onClick={() => setPg(0)}>«</button>
          <button style={btnStyle(pg === 0)} disabled={pg === 0} onClick={() => setPg(pg - 1)}>‹ Prev</button>
          <button style={btnStyle(pg >= pages - 1)} disabled={pg >= pages - 1} onClick={() => setPg(pg + 1)}>Next ›</button>
          <button style={btnStyle(pg >= pages - 1)} disabled={pg >= pages - 1} onClick={() => setPg(pages - 1)}>»</button>
        </>}
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--gg-text-dim, #6b7280)", marginLeft: "auto" }}>
          Per page:
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPg(0); setPage(0); setFilterPage(0); }}
            style={{ ...selectStyle, padding: "4px 8px", fontSize: 13 }}
          >
            {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    );
  }

  // ── Render helpers ──
  function renderTable(displayRows: Record<string, any>[], empty?: React.ReactNode) {
    if (displayRows.length === 0) {
      return (
        <div style={{
          border: "1px dashed var(--gg-border, #e5e7eb)",
          borderRadius: 8,
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--gg-text-dim, #9ca3af)",
        }}>
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
                <th key={col.key} style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontWeight: 600,
                  color: "var(--gg-text-dim, #6b7280)",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                  width: col.width ?? undefined,
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              if (rowHrefPrefix) {
                return (
                  <tr key={row.id} className="search-list-row">
                    {columns.map((col) => (
                      <td key={col.key} style={{ padding: 0, borderBottom: "1px solid var(--gg-border, #f3f4f6)" }}>
                        <Link href={`${rowHrefPrefix}${row.id}`} style={{
                          display: "block",
                          padding: "9px 12px",
                          textDecoration: "none",
                          color: "inherit",
                          maxWidth: col.width ?? 300,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {row[col.key] ?? ""}
                        </Link>
                      </td>
                    ))}
                  </tr>
                );
              }
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--gg-border, #f3f4f6)" }}>
                  {columns.map((col) => (
                    <td key={col.key} style={{
                      padding: "9px 12px",
                      maxWidth: col.width ?? 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {row[col.key] ?? ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

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
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: mode === m ? 600 : 400,
              background: mode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-bg, #fff)",
              color: mode === m ? "#fff" : "var(--gg-text, #374151)",
              border: "none",
              cursor: "pointer",
            }}>
              {m === "search" ? "Quick Search" : "Filters"}
            </button>
          ))}
        </div>
      )}

      {/* ── QUICK SEARCH ── */}
      {mode === "search" && (
        <>
          <div style={{ position: "relative" }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 12px",
                border: "1px solid var(--gg-border, #e5e7eb)",
                borderRadius: 6,
                fontSize: 14,
                background: "var(--gg-bg, #fff)",
                color: "var(--gg-text, #111)",
                outline: "none",
              }}
            />
          </div>

          {loading && <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>Searching...</p>}

          {!loading && searched && rows.length === 0
            ? renderTable([], <p style={{ margin: 0, fontSize: 14 }}>
                {query.trim() ? `No results for "${query}"` : "No records found."}
              </p>)
            : renderTable(rows.slice(page * perPage, (page + 1) * perPage))
          }

          {!loading && searched && total > 0 && renderPagination(total, page, setPage)}
        </>
      )}

      {/* ── FILTER MODE ── */}
      {mode === "filter" && target && (
        <>
          <div style={{
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 8,
            padding: "16px",
            background: "var(--gg-bg-subtle, #f9fafb)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            {filterRows.map((row, i) => {
              const col = getSchemaCol(row.field);
              const ops = opsForType(col?.data_type ?? "text");
              const hideValue = ["is_empty", "not_empty", "is_true", "is_false"].includes(row.op);
              return (
                <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gg-text-dim, #6b7280)", minWidth: 36, textAlign: "right" }}>
                    {i === 0 ? "WHERE" : "AND"}
                  </span>
                  <select value={row.field} onChange={(e) => updateFilterRow(row.id, { field: e.target.value })} style={selectStyle}>
                    {schema.length === 0 && <option value="">Loading...</option>}
                    {schema.filter((c) => !c.is_join).length > 0 && (
                      <optgroup label="Fields">
                        {schema.filter((c) => !c.is_join).map((c) => (
                          <option key={c.column} value={c.column}>{c.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {schema.filter((c) => c.is_join && c.table === "locations").length > 0 && (
                      <optgroup label="Location Fields">
                        {schema.filter((c) => c.is_join && c.table === "locations").map((c) => (
                          <option key={c.column} value={c.column}>{c.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {schema.filter((c) => c.is_join && c.table === "households").length > 0 && (
                      <optgroup label="Household Fields">
                        {schema.filter((c) => c.is_join && c.table === "households").map((c) => (
                          <option key={c.column} value={c.column}>{c.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {schema.filter((c) => c.is_join && !c.table).length > 0 && (
                      <optgroup label="Joined Fields">
                        {schema.filter((c) => c.is_join && !c.table).map((c) => (
                          <option key={c.column} value={c.column}>{c.label}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <select value={row.op} onChange={(e) => updateFilterRow(row.id, { op: e.target.value as FilterOp })} style={selectStyle}>
                    {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!hideValue && (() => {
                    const enumOpts = enumOptions[row.field];
                    const isNumeric = isNumericType(col?.data_type ?? "");
                    // Multi-value "is any of" — chips for enum, comma-text for free fields
                    if (row.op === "in_list" || row.op === "not_in_list") {
                      const isExclude = row.op === "not_in_list";
                      if (enumOpts) {
                        const selected = new Set(row.value.split(",").map((v) => v.trim()).filter(Boolean));
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: "1 1 200px" }}>
                            {enumOpts.map((v) => {
                              const on = selected.has(v);
                              const activeColor = isExclude ? "#dc2626" : "var(--gg-primary, #2563eb)";
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => {
                                    const next = new Set(selected);
                                    if (on) next.delete(v); else next.add(v);
                                    updateFilterRow(row.id, { value: [...next].join(",") });
                                  }}
                                  style={{
                                    padding: "3px 9px",
                                    borderRadius: 4,
                                    border: `1px solid ${on ? activeColor : "var(--gg-border, #e5e7eb)"}`,
                                    background: on ? (isExclude ? "rgba(220,38,38,0.1)" : "rgba(37,99,235,0.1)") : "var(--gg-bg, #fff)",
                                    color: on ? activeColor : "var(--gg-text-dim, #6b7280)",
                                    fontSize: 12,
                                    fontWeight: on ? 600 : 400,
                                    cursor: "pointer",
                                  }}
                                >
                                  {v}
                                </button>
                              );
                            })}
                          </div>
                        );
                      }
                      return (
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                          placeholder="e.g. 77001, 77002, 77494"
                          onKeyDown={(e) => { if (e.key === "Enter") runFilter(); }}
                          style={{
                            flex: "1 1 200px",
                            padding: "6px 10px",
                            border: "1px solid var(--gg-border, #e5e7eb)",
                            borderRadius: 5,
                            fontSize: 14,
                            background: "var(--gg-bg, #fff)",
                            color: "var(--gg-text, #111)",
                            outline: "none",
                          }}
                        />
                      );
                    }
                    if (enumOpts) {
                      return (
                        <select
                          value={row.value}
                          onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                          style={{ ...selectStyle, flex: "1 1 160px" }}
                        >
                          <option value="">— select —</option>
                          {enumOpts.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      );
                    }
                    return (
                      <input
                        type={isNumeric ? "number" : "text"}
                        value={row.value}
                        onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                        placeholder="value..."
                        onKeyDown={(e) => { if (e.key === "Enter") runFilter(); }}
                        style={{
                          flex: "1 1 160px",
                          padding: "6px 10px",
                          border: "1px solid var(--gg-border, #e5e7eb)",
                          borderRadius: 5,
                          fontSize: 14,
                          background: "var(--gg-bg, #fff)",
                          color: "var(--gg-text, #111)",
                          outline: "none",
                        }}
                      />
                    );
                  })()}
                  {filterRows.length > 1 && (
                    <button onClick={() => removeFilterRow(row.id)} title="Remove filter" style={{
                      padding: "5px 9px",
                      border: "1px solid var(--gg-border, #e5e7eb)",
                      borderRadius: 5,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "var(--gg-text-dim, #9ca3af)",
                    }}>
                      x
                    </button>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <button onClick={addFilterRow} style={{
                padding: "6px 12px",
                border: "1px dashed var(--gg-border, #d1d5db)",
                borderRadius: 5,
                background: "transparent",
                fontSize: 13,
                cursor: "pointer",
                color: "var(--gg-text-dim, #6b7280)",
              }}>
                + Add filter
              </button>
              <button onClick={runFilter} disabled={filterLoading} style={{
                padding: "7px 20px",
                background: filterLoading ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: filterLoading ? "not-allowed" : "pointer",
                opacity: filterLoading ? 0.7 : 1,
              }}>
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
            ? renderTable([], <>
                <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--gg-text, #374151)" }}>Set your filters above</p>
                <p style={{ margin: 0, fontSize: 14 }}>Add one or more conditions, then click Search.</p>
              </>)
            : filterLoading
              ? null
              : filterResults.length === 0
                ? renderTable([], <p style={{ margin: 0, fontSize: 14 }}>No results matched your filters.</p>)
                : <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
                        {filterResults.length} result{filterResults.length !== 1 ? "s" : ""}
                      </span>
                      {target && (
                        <button
                          onClick={() => { setShowExport((v) => !v); setExportErr(null); }}
                          style={{
                            padding: "6px 14px",
                            border: "1px solid var(--gg-border, #e5e7eb)",
                            borderRadius: 6,
                            background: showExport ? "var(--gg-primary, #2563eb)" : "var(--gg-bg, #fff)",
                            color: showExport ? "#fff" : "var(--gg-text, #374151)",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Save as List
                        </button>
                      )}
                    </div>

                    {showExport && (
                      <div style={{
                        border: "1px solid var(--gg-border, #e5e7eb)",
                        borderRadius: 8,
                        padding: 16,
                        background: "var(--gg-bg-subtle, #f9fafb)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                          Create list from all {filterResults.length} results
                        </p>
                        <input
                          type="text"
                          value={exportName}
                          onChange={(e) => setExportName(e.target.value)}
                          placeholder="List name…"
                          style={{
                            padding: "7px 10px",
                            border: "1px solid var(--gg-border, #e5e7eb)",
                            borderRadius: 5,
                            fontSize: 14,
                            background: "var(--gg-bg, #fff)",
                            color: "var(--gg-text, #111)",
                            outline: "none",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          {(["call", "knock", "both"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setExportMode(m)}
                              style={{
                                padding: "5px 12px",
                                borderRadius: 5,
                                border: `1px solid ${exportMode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                                background: exportMode === m ? "rgba(37,99,235,0.08)" : "var(--gg-bg, #fff)",
                                color: exportMode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-text-dim, #6b7280)",
                                fontWeight: exportMode === m ? 700 : 400,
                                fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              {m === "call" ? "📞 Dials" : m === "knock" ? "🚪 Doors" : "📞🚪 Both"}
                            </button>
                          ))}
                        </div>
                        {exportErr && <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>{exportErr}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={handleExport}
                            disabled={exporting || !exportName.trim()}
                            style={{
                              padding: "7px 18px",
                              background: exporting || !exportName.trim() ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              fontWeight: 600,
                              fontSize: 14,
                              cursor: exporting || !exportName.trim() ? "not-allowed" : "pointer",
                            }}
                          >
                            {exporting ? "Creating…" : "Create List"}
                          </button>
                          <button onClick={() => setShowExport(false)} style={{ padding: "7px 14px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, background: "var(--gg-bg, #fff)", fontSize: 14, cursor: "pointer", color: "var(--gg-text, #374151)" }}>
                            Cancel
                          </button>
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
