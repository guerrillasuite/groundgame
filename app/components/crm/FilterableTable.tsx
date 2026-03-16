"use client";

import { useState, useEffect, useRef } from "react";
import { Filter, Plus, X, Search, Download } from "lucide-react";
import ListPage from "@/app/crm/_shared/ListPage";
import type { ColumnDef } from "@/app/api/crm/schema/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterInputMode(dataType?: string): React.HTMLAttributes<HTMLInputElement>["inputMode"] {
  if (["integer", "bigint", "numeric", "double precision", "real", "smallint"].includes(dataType ?? "")) return "numeric";
  return "text";
}

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterOp =
  | "contains" | "equals" | "starts_with"
  | "not_contains" | "is_empty" | "not_empty"
  | "greater_than" | "less_than" | "is_true" | "is_false";

type FilterRow = { id: string; field: string; op: FilterOp; value: string };

type TableTarget = "people" | "households" | "locations";
type AppMode = "call" | "knock" | "both";

export type Row = { id: string; [key: string]: string | number };

interface Props {
  table: TableTarget;
  initialRows: Row[];
  columns: { key: string; label: string; width?: number }[];
  exportable?: boolean;
  rowHrefPrefix?: string;
}

// ─── Operator sets by data type ───────────────────────────────────────────────

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Is" },
  { value: "starts_with", label: "Starts with" },
  { value: "not_contains", label: "Does not contain" },
  { value: "is_empty", label: "Is empty" },
  { value: "not_empty", label: "Is not empty" },
];

const NUM_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
];

const BOOL_OPS: { value: FilterOp; label: string }[] = [
  { value: "is_true", label: "Is true" },
  { value: "is_false", label: "Is false" },
];

const NO_VALUE_OPS = new Set<FilterOp>(["is_empty", "not_empty", "is_true", "is_false"]);

function opsForType(dt: string): { value: FilterOp; label: string }[] {
  if (dt === "boolean") return BOOL_OPS;
  if (dt === "integer" || dt === "numeric" || dt === "bigint") return NUM_OPS;
  return TEXT_OPS;
}

function defaultOp(dt: string): FilterOp {
  if (dt === "boolean") return "is_true";
  if (dt === "integer" || dt === "numeric" || dt === "bigint") return "equals";
  return "contains";
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  padding: "7px 28px 7px 10px",
  borderRadius: 6,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
  fontSize: 13,
  cursor: "pointer",
  width: "100%",
};

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 7,
    border: `2px solid ${active ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
    background: active ? "rgba(37,99,235,0.07)" : "none",
    color: active ? "var(--gg-primary, #2563eb)" : "var(--gg-text-dim, #6b7280)",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    cursor: "pointer",
  };
}

let _fid = 0;
function makeId() { return `f${++_fid}`; }

// ─── Component ───────────────────────────────────────────────────────────────

export default function FilterableTable({ table, initialRows, columns, exportable = true, rowHrefPrefix }: Props) {
  const [schema, setSchema] = useState<ColumnDef[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [activeRows, setActiveRows] = useState<Row[] | null>(null); // null = show initialRows
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);

  // Selection for export
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const exportInFlight = useRef(false);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exportMode, setExportMode] = useState<AppMode>("call");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ id: string; name: string } | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Load schema when filter panel is opened for the first time
  useEffect(() => {
    if (!filterOpen || schema.length > 0) return;
    setSchemaLoading(true);
    fetch(`/api/crm/schema?table=${table}`)
      .then((r) => r.json())
      .then((d) => {
        const cols: ColumnDef[] = Array.isArray(d) ? d : [];
        setSchema(cols);
        if (cols.length > 0) {
          setFilters([{ id: makeId(), field: cols[0].column, op: defaultOp(cols[0].data_type), value: "" }]);
        }
      })
      .catch(() => {})
      .finally(() => setSchemaLoading(false));
  }, [filterOpen, schema.length, table]);

  function schemaForField(field: string): ColumnDef | undefined {
    return schema.find((c) => c.column === field);
  }

  // ── Filter ops ─────────────────────────────────────────────────────────────

  function addFilter() {
    const firstField = schema[0];
    if (!firstField) return;
    setFilters((prev) => [...prev, { id: makeId(), field: firstField.column, op: defaultOp(firstField.data_type), value: "" }]);
  }

  function removeFilter(id: string) {
    setFilters((prev) => prev.length > 1 ? prev.filter((f) => f.id !== id) : prev);
  }

  function updateFilter(id: string, patch: Partial<Omit<FilterRow, "id">>) {
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        if (patch.field && patch.field !== f.field) {
          const def = schema.find((c) => c.column === patch.field);
          next.op = defaultOp(def?.data_type ?? "text");
        }
        return next;
      })
    );
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchErr(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/crm/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: table,
          filters: filters.filter((f) => f.field).map(({ field, op, value }) => ({ field, op, value })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");

      // Map search results → table rows using the page's column definitions
      const mapped = (data as any[]).map((item: any) => {
        const row: Row = { id: item.id };
        for (const col of columns) {
          // Handle common mappings
          if (col.key === "name" && (item.first_name !== undefined || item.last_name !== undefined)) {
            row[col.key] = [item.first_name, item.last_name].filter(Boolean).join(" ") || "(No name)";
          } else if (col.key === "address" && item.address !== undefined) {
            const parts = [item.address, item.city, item.state, item.postal_code].filter(Boolean);
            row[col.key] = parts.join(", ");
          } else if (col.key === "people" && item.people_count !== undefined) {
            row[col.key] = `${item.people_count} ${item.people_count === 1 ? "person" : "people"}`;
          } else {
            row[col.key] = item[col.key] ?? item[col.key.replace("_", "")] ?? "";
          }
        }
        return row;
      });

      setActiveRows(mapped);
      setFilterCount(filters.filter((f) => f.field && (f.value || NO_VALUE_OPS.has(f.op))).length);
    } catch (err: any) {
      setSearchErr(err.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function clearFilters() {
    setActiveRows(null);
    setFilterCount(0);
    setSelectedIds(new Set());
    setSearchErr(null);
    if (schema.length > 0) {
      setFilters([{ id: makeId(), field: schema[0].column, op: defaultOp(schema[0].data_type), value: "" }]);
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    if (!exportName.trim() || exportInFlight.current) return;
    exportInFlight.current = true;
    setExporting(true);
    setExportErr(null);
    setExportResult(null);

    const rows = activeRows ?? initialRows;
    const ids = selectedIds.size > 0
      ? [...selectedIds]
      : rows.map((r) => r.id);

    try {
      const res = await fetch("/api/crm/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: exportName.trim(),
          app_mode: exportMode,
          target: table,
          selected_ids: ids,
          user_ids: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create list");
      const first = data.walklists?.[0];
      setExportResult(first ?? { id: "", name: exportName });
    } catch (err: any) {
      setExportErr(err.message ?? "Failed to create list");
    } finally {
      setExporting(false);
      exportInFlight.current = false;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayRows = activeRows ?? initialRows;
  const hasResults = activeRows !== null;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 14px", borderRadius: 8,
            background: filterOpen ? "rgba(37,99,235,0.1)" : "var(--gg-card, white)",
            border: `1px solid ${filterOpen ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
            color: filterOpen ? "var(--gg-primary, #2563eb)" : "var(--gg-text, #374151)",
            fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}
        >
          <Filter size={14} />
          Filters
          {filterCount > 0 && (
            <span style={{ background: "var(--gg-primary, #2563eb)", color: "white", borderRadius: 10, fontSize: 11, fontWeight: 700, padding: "1px 7px" }}>
              {filterCount}
            </span>
          )}
        </button>

        {hasResults && (
          <>
            <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
              {displayRows.length.toLocaleString()} result{displayRows.length !== 1 ? "s" : ""}
              {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
            </span>

            <button
              onClick={clearFilters}
              style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", textDecoration: "underline" }}
            >
              Clear
            </button>

            {exportable && (
              <button
                onClick={() => { setExportOpen(true); setExportResult(null); setExportErr(null); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, marginLeft: "auto", padding: "8px 14px", borderRadius: 8, background: "var(--gg-primary, #2563eb)", color: "white", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer" }}
              >
                <Download size={14} />
                Export to List
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Filter Panel ─────────────────────────────────────────────────── */}
      {filterOpen && (
        <div style={{ background: "var(--gg-card, white)", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 10, padding: 20, marginBottom: 16 }}>
          {schemaLoading ? (
            <p style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", margin: 0 }}>Loading fields…</p>
          ) : (
            <form onSubmit={applyFilters}>
              <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                {filters.map((f, i) => {
                  const def = schemaForField(f.field);
                  const ops = opsForType(def?.data_type ?? "text");
                  return (
                    <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 1fr 30px", gap: 7, alignItems: "end" }}>
                      <div>
                        {i === 0 && <label style={{ display: "block", fontSize: 10, fontWeight: 700, marginBottom: 3, color: "var(--gg-text-dim, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Field</label>}
                        <select value={f.field} onChange={(e) => updateFilter(f.id, { field: e.target.value })} style={selectStyle}>
                          {schema.map((c) => (
                            <option key={c.column} value={c.column}>
                              {c.label}{c.is_join ? " (location)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        {i === 0 && <label style={{ display: "block", fontSize: 10, fontWeight: 700, marginBottom: 3, color: "var(--gg-text-dim, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Condition</label>}
                        <select value={f.op} onChange={(e) => updateFilter(f.id, { op: e.target.value as FilterOp })} style={selectStyle}>
                          {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      <div>
                        {i === 0 && <label style={{ display: "block", fontSize: 10, fontWeight: 700, marginBottom: 3, color: "var(--gg-text-dim, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Value</label>}
                        {NO_VALUE_OPS.has(f.op) ? (
                          <div style={{ ...inputStyle, background: "var(--gg-bg, #f9fafb)", color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>(no value)</div>
                        ) : (
                          <input style={inputStyle} value={f.value} onChange={(e) => updateFilter(f.id, { value: e.target.value })} placeholder="Value…" inputMode={filterInputMode(def?.data_type)} />
                        )}
                      </div>

                      <button type="button" onClick={() => removeFilter(f.id)} disabled={filters.length === 1} style={{ background: "none", border: "none", cursor: filters.length === 1 ? "default" : "pointer", padding: 5, borderRadius: 5, color: filters.length === 1 ? "var(--gg-border, #d1d5db)" : "var(--gg-text-dim, #6b7280)", display: "flex", alignItems: "center", height: 35 }}>
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {searchErr && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 10px" }}>{searchErr}</p>}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={addFilter} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 6, background: "none", border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--gg-text, #374151)" }}>
                  <Plus size={13} />
                  Add Filter
                </button>

                <button type="submit" disabled={searching} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, background: searching ? "rgba(37,99,235,0.4)" : "var(--gg-primary, #2563eb)", color: "white", fontWeight: 700, fontSize: 13, border: "none", cursor: searching ? "wait" : "pointer" }}>
                  <Search size={13} />
                  {searching ? "Searching…" : "Apply Filters"}
                </button>

                {hasResults && (
                  <button type="button" onClick={clearFilters} style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", background: "none", border: "none", cursor: "pointer", padding: "7px 8px" }}>
                    Clear
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Selection row (when filter results exist) ──────────────────── */}
      {hasResults && displayRows.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <button onClick={() => setSelectedIds(new Set(displayRows.map((r) => r.id)))} style={{ fontSize: 12, fontWeight: 600, color: "var(--gg-primary, #2563eb)", background: "none", border: "none", cursor: "pointer", padding: "3px 8px" }}>
            Select All
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", background: "none", border: "none", cursor: "pointer", padding: "3px 8px" }}>
            None
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <ListPage title="" columns={columns} rows={displayRows} rowHrefPrefix={rowHrefPrefix} />

      {/* ── Export Modal ─────────────────────────────────────────────────── */}
      {exportOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}
        >
          <div style={{ background: "var(--gg-card, white)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            {exportResult ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                <h3 style={{ margin: "0 0 8px", fontWeight: 700 }}>List Created!</h3>
                <p style={{ margin: "0 0 20px", color: "var(--gg-text-dim, #6b7280)", fontSize: 14 }}>
                  "{exportResult.name}" is ready.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <a href={`/crm/lists/${exportResult.id}`} style={{ padding: "10px 20px", borderRadius: 8, background: "var(--gg-primary, #2563eb)", color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                    View List →
                  </a>
                  <button onClick={() => setExportOpen(false)} style={{ padding: "10px 20px", borderRadius: 8, background: "none", border: "1px solid var(--gg-border, #e5e7eb)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 style={{ margin: "0 0 20px", fontWeight: 700, fontSize: 17 }}>Export to List</h3>

                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 5, color: "var(--gg-text-dim, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>List Name</label>
                    <input
                      style={{ ...inputStyle, fontSize: 14 }}
                      value={exportName}
                      onChange={(e) => setExportName(e.target.value)}
                      placeholder="Enter a name for this list…"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 8, color: "var(--gg-text-dim, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shows up as</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["call", "knock", "both"] as AppMode[]).map((m) => (
                        <button key={m} type="button" onClick={() => setExportMode(m)} style={toggleBtnStyle(exportMode === m)}>
                          {m === "call" ? "📞 Dials" : m === "knock" ? "🚪 Doors" : "📞🚪 Both"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                    Exporting{" "}
                    <strong>
                      {selectedIds.size > 0 ? selectedIds.size : displayRows.length} {table}
                    </strong>
                    {selectedIds.size === 0 && displayRows !== initialRows ? " (all filtered results)" : selectedIds.size > 0 ? " (selected)" : ""}
                  </p>

                  {exportErr && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{exportErr}</p>}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={handleExport}
                      disabled={!exportName.trim() || exporting}
                      style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 20px", borderRadius: 8, background: !exportName.trim() || exporting ? "rgba(37,99,235,0.3)" : "var(--gg-primary, #2563eb)", color: "white", fontWeight: 700, fontSize: 14, border: "none", cursor: !exportName.trim() || exporting ? "not-allowed" : "pointer" }}
                    >
                      <Download size={15} />
                      {exporting ? "Creating…" : "Create List"}
                    </button>
                    <button onClick={() => setExportOpen(false)} style={{ padding: "11px 16px", borderRadius: 8, background: "none", border: "1px solid var(--gg-border, #e5e7eb)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
