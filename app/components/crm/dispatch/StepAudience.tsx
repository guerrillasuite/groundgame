"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 5,
  color: "rgb(var(--text-300))",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid rgb(var(--border-600))",
  background: "rgb(var(--surface-800))",
  color: "rgb(var(--text-100))",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

export type AudienceData = {
  audience_type: "segment" | "list" | "manual";
  audience_list_id: string | null;
  audience_segment_filters: SegmentFilter[] | null;
  audience_person_ids: string[] | null;
};

export type SegmentFilter = {
  field: string;
  op: string;
  value: string;
};

type Walklist = {
  id: string;
  name: string | null;
  mode: string | null;
  total_targets: number;
};

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type AudiencePreview = { count: number; suppressed: number; no_email?: number; unsubscribed?: number } | null;

interface Props {
  data: AudienceData;
  onChange: (patch: Partial<AudienceData>) => void;
  walklists: Walklist[];
}

const FILTER_FIELDS = [
  { key: "email",            label: "Email",                group: "Person" },
  { key: "first_name",       label: "First Name",           group: "Person" },
  { key: "last_name",        label: "Last Name",            group: "Person" },
  { key: "city",             label: "City",                 group: "Location" },
  { key: "state",            label: "State",                group: "Location" },
  { key: "postal_code",      label: "ZIP Code",             group: "Location" },
  { key: "company.name",     label: "Company Name",         group: "Company" },
  { key: "company.industry", label: "Company Industry",     group: "Company" },
  { key: "company.status",   label: "Company Status",       group: "Company" },
  { key: "opp.stage",        label: "Opportunity Stage",    group: "Opportunity" },
  { key: "opp.pipeline",     label: "Opportunity Pipeline", group: "Opportunity" },
  { key: "opp.source",       label: "Opportunity Source",   group: "Opportunity" },
  { key: "opp.priority",     label: "Opportunity Priority", group: "Opportunity" },
];

const FILTER_OPS = [
  { value: "contains",    label: "Contains" },
  { value: "equals",      label: "Is" },
  { value: "starts_with", label: "Starts with" },
  { value: "not_empty",   label: "Has a value" },
  { value: "is_empty",    label: "Is empty" },
];

const NO_VALUE_OPS = new Set(["is_empty", "not_empty"]);
const PER_PAGE = 50;

let _id = 0;
function uid() { return `sf${++_id}`; }
type FilterRow = SegmentFilter & { _id: string };

// Indeterminate checkbox
function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "rgb(var(--primary-600))" }}
    />
  );
}

export default function StepAudience({ data, onChange, walklists }: Props) {
  const [preview, setPreview] = useState<AudiencePreview>(null);
  const [previewing, setPreviewing] = useState(false);

  const [filterRows, setFilterRows] = useState<FilterRow[]>(() =>
    data.audience_segment_filters?.map((f) => ({ ...f, _id: uid() })) ?? [
      { _id: uid(), field: "email", op: "not_empty", value: "" },
    ]
  );

  // ── Confirm selection modal state ─────────────────────────────────────────
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [allPeople, setAllPeople] = useState<PersonRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(data.audience_person_ids ?? [])
  );
  const [selectorPage, setSelectorPage] = useState(0);
  const [selectorSearch, setSelectorSearch] = useState("");

  const syncFilters = useCallback(
    (rows: FilterRow[]) => {
      onChange({
        audience_segment_filters: rows.map(({ field, op, value }) => ({ field, op, value })),
      });
    },
    [onChange]
  );

  function addFilter() {
    const next = [...filterRows, { _id: uid(), field: "email", op: "contains", value: "" }];
    setFilterRows(next);
    syncFilters(next);
  }

  function removeFilter(id: string) {
    if (filterRows.length <= 1) return;
    const next = filterRows.filter((f) => f._id !== id);
    setFilterRows(next);
    syncFilters(next);
  }

  function updateFilterRow(id: string, patch: Partial<FilterRow>) {
    const next = filterRows.map((f) => (f._id === id ? { ...f, ...patch } : f));
    setFilterRows(next);
    syncFilters(next);
  }

  // ── Preview count ─────────────────────────────────────────────────────────
  async function fetchPreview() {
    setPreviewing(true);
    setPreview(null);
    try {
      const body =
        data.audience_type === "list"
          ? { audience_type: "list", audience_list_id: data.audience_list_id }
          : { audience_type: "segment", audience_segment_filters: data.audience_segment_filters };
      const res = await fetch("/api/dispatch/audience-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) setPreview(json);
    } catch { /* non-critical */ }
    finally { setPreviewing(false); }
  }

  // ── Load people for selector ───────────────────────────────────────────────
  async function openSelector() {
    setSelectorOpen(true);
    setSelectorPage(0);
    setSelectorSearch("");
    setLoadingPeople(true);
    try {
      const body =
        data.audience_type === "list"
          ? { audience_type: "list", audience_list_id: data.audience_list_id }
          : { audience_type: "segment", audience_segment_filters: data.audience_segment_filters };
      const res = await fetch("/api/dispatch/audience-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const people: PersonRow[] = json.people ?? [];
      setAllPeople(people);
      // Pre-select everyone if no existing manual selection, or restore existing
      if (data.audience_type !== "manual") {
        setSelectedIds(new Set(people.map((p) => p.id)));
      }
    } catch { setAllPeople([]); }
    finally { setLoadingPeople(false); }
  }

  function confirmSelection() {
    const ids = Array.from(selectedIds);
    onChange({
      audience_type: "manual",
      audience_person_ids: ids,
      // Keep filters/list intact so user can re-open and change
    });
    setSelectorOpen(false);
  }

  function clearManual() {
    onChange({
      audience_type: "segment",
      audience_person_ids: null,
    });
  }

  // ── Selector derived values ────────────────────────────────────────────────
  const filteredPeople = selectorSearch
    ? allPeople.filter((p) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ").toLowerCase();
        const q = selectorSearch.toLowerCase();
        return name.includes(q) || (p.email ?? "").toLowerCase().includes(q);
      })
    : allPeople;

  const totalPages = Math.ceil(filteredPeople.length / PER_PAGE);
  const pagePeople = filteredPeople.slice(selectorPage * PER_PAGE, (selectorPage + 1) * PER_PAGE);

  const allOnPageSelected = pagePeople.length > 0 && pagePeople.every((p) => selectedIds.has(p.id));
  const someOnPageSelected = pagePeople.some((p) => selectedIds.has(p.id));

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredPeople.forEach((p) => (checked ? next.add(p.id) : next.delete(p.id)));
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pagePeople.forEach((p) => (checked ? next.add(p.id) : next.delete(p.id)));
      return next;
    });
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  const isManual = data.audience_type === "manual";
  const manualCount = data.audience_person_ids?.length ?? 0;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Audience</h2>
        <p style={{ margin: 0, fontSize: 13, color: "rgb(var(--text-300))" }}>
          Choose who receives this campaign.
        </p>
      </div>

      {/* Manual mode banner */}
      {isManual && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#16a34a", flex: 1 }}>
            ✓ {manualCount.toLocaleString()} {manualCount === 1 ? "person" : "people"} manually selected
          </span>
          <button type="button" className="gg-btn-ghost" onClick={openSelector} style={{ fontSize: 13 }}>
            Edit Selection
          </button>
          <button type="button" className="gg-btn-ghost" onClick={clearManual} style={{ fontSize: 12 }}>
            Clear & Use Filters
          </button>
        </div>
      )}

      {/* Only show filter/list UI when not in manual mode (or always, so they can change filters before re-selecting) */}

      {/* Type toggle */}
      {!isManual && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={data.audience_type === "segment" ? "gg-btn-tab-active" : "gg-btn-tab"}
            onClick={() => onChange({ audience_type: "segment" })}
          >
            Filter by Field
          </button>
          <button
            type="button"
            className={data.audience_type === "list" ? "gg-btn-tab-active" : "gg-btn-tab"}
            onClick={() => onChange({ audience_type: "list" })}
          >
            Saved List
          </button>
        </div>
      )}

      {/* Segment filters */}
      {!isManual && data.audience_type === "segment" && (
        <div
          style={{
            background: "rgb(var(--card-700))",
            border: "1px solid rgb(var(--border-600))",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {filterRows.map((f, i) => (
              <div
                key={f._id}
                style={{ display: "grid", gridTemplateColumns: "1fr 160px 1fr 32px", gap: 8, alignItems: "end" }}
              >
                <div>
                  {i === 0 && <label style={labelStyle}>Field</label>}
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={f.field}
                    onChange={(e) => updateFilterRow(f._id, { field: e.target.value })}>
                    {["Person", "Location", "Company", "Opportunity"].map((group) => (
                      <optgroup key={group} label={group}>
                        {FILTER_FIELDS.filter((ff) => ff.group === group).map((ff) => (
                          <option key={ff.key} value={ff.key}>{ff.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <label style={labelStyle}>Condition</label>}
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={f.op}
                    onChange={(e) => updateFilterRow(f._id, { op: e.target.value })}>
                    {FILTER_OPS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <label style={labelStyle}>Value</label>}
                  {NO_VALUE_OPS.has(f.op) ? (
                    <div style={{ ...inputStyle, color: "rgb(var(--text-300))", fontStyle: "italic" }}>
                      (no value)
                    </div>
                  ) : (
                    <input style={inputStyle} value={f.value}
                      onChange={(e) => updateFilterRow(f._id, { value: e.target.value })}
                      placeholder="Value…" />
                  )}
                </div>
                <button type="button" className="gg-btn-icon"
                  disabled={filterRows.length <= 1}
                  onClick={() => removeFilter(f._id)}
                  style={{ alignSelf: "flex-end" }}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="gg-btn-ghost" onClick={addFilter} style={{ fontSize: 13 }}>
            + Add Filter
          </button>
        </div>
      )}

      {/* List picker */}
      {!isManual && data.audience_type === "list" && (
        <div>
          <label style={labelStyle}>Select a List</label>
          <select style={{ ...inputStyle, cursor: "pointer" }} value={data.audience_list_id ?? ""}
            onChange={(e) => onChange({ audience_list_id: e.target.value || null })}>
            <option value="">— Choose a walklist —</option>
            {walklists.map((wl) => (
              <option key={wl.id} value={wl.id}>
                {wl.name ?? "(Untitled)"} — {wl.total_targets.toLocaleString()} targets
              </option>
            ))}
          </select>
          {walklists.length === 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgb(var(--text-300))" }}>
              No walklists found. Create one in{" "}
              <a href="/crm/lists" style={{ color: "rgb(var(--primary-600))" }}>Lists</a> first.
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isManual && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="gg-btn-ghost" onClick={fetchPreview}
            disabled={previewing} style={{ cursor: previewing ? "wait" : undefined }}>
            {previewing ? "Counting…" : "Preview Count"}
          </button>
          <button type="button" className="gg-btn-primary" onClick={openSelector}
            style={{ fontSize: 13 }}>
            Preview & Select →
          </button>
          {preview && (
            <span style={{ fontSize: 14, color: "rgb(var(--text-100))", display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                <strong>{preview.count.toLocaleString()}</strong> recipient{preview.count !== 1 ? "s" : ""}
              </span>
              {(preview.no_email ?? 0) > 0 && (
                <span style={{ fontSize: 12, color: "#f59e0b" }}>
                  ⚠ {preview.no_email!.toLocaleString()} contact{preview.no_email !== 1 ? "s" : ""} have no email address
                </span>
              )}
              {(preview.unsubscribed ?? 0) > 0 && (
                <span style={{ fontSize: 12, color: "rgb(var(--text-300))" }}>
                  · {preview.unsubscribed!.toLocaleString()} unsubscribed
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* ── Confirm Selection Modal ─────────────────────────────────────────── */}
      {selectorOpen && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 400,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectorOpen(false); }}
        >
          <div
            style={{
              background: "rgb(var(--card-700))",
              border: "1px solid rgb(var(--border-600))",
              borderRadius: 14,
              width: "min(92vw, 720px)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid rgb(var(--border-600))",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Select Recipients</h3>
                {!loadingPeople && (
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "rgb(var(--text-300))" }}>
                    {filteredPeople.length.toLocaleString()} matched ·{" "}
                    <strong style={{ color: "rgb(var(--text-100))" }}>
                      {selectedIds.size.toLocaleString()} selected
                    </strong>
                  </p>
                )}
              </div>
              <button type="button" className="gg-btn-ghost" onClick={() => setSelectorOpen(false)}
                style={{ fontSize: 12, padding: "4px 10px" }}>
                Cancel
              </button>
            </div>

            {loadingPeople ? (
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgb(var(--text-300))", fontSize: 14, padding: 48,
              }}>
                Loading recipients…
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div
                  style={{
                    padding: "12px 24px",
                    borderBottom: "1px solid rgb(var(--border-600))",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexShrink: 0,
                    flexWrap: "wrap",
                  }}
                >
                  <button type="button" className="gg-btn-ghost"
                    onClick={() => toggleAll(true)} style={{ fontSize: 12, padding: "5px 12px" }}>
                    Select All ({filteredPeople.length.toLocaleString()})
                  </button>
                  <button type="button" className="gg-btn-ghost"
                    onClick={() => toggleAll(false)} style={{ fontSize: 12, padding: "5px 12px" }}>
                    Deselect All
                  </button>
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={selectorSearch}
                    onChange={(e) => { setSelectorSearch(e.target.value); setSelectorPage(0); }}
                    style={{
                      ...inputStyle,
                      width: "auto",
                      flex: 1,
                      minWidth: 160,
                      fontSize: 13,
                      padding: "6px 10px",
                    }}
                  />
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "rgb(var(--card-700))", zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: "8px 16px", width: 40, borderBottom: "1px solid rgb(var(--border-600))" }}>
                          <IndeterminateCheckbox
                            checked={allOnPageSelected}
                            indeterminate={!allOnPageSelected && someOnPageSelected}
                            onChange={togglePage}
                          />
                        </th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-300))", borderBottom: "1px solid rgb(var(--border-600))" }}>
                          Name
                        </th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-300))", borderBottom: "1px solid rgb(var(--border-600))" }}>
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagePeople.map((p) => {
                        const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "(No name)";
                        const checked = selectedIds.has(p.id);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => toggleOne(p.id, !checked)}
                            style={{
                              cursor: "pointer",
                              background: checked ? "rgba(37,99,235,0.07)" : "transparent",
                              transition: "background .1s",
                            }}
                          >
                            <td style={{ padding: "9px 16px", borderBottom: "1px solid rgb(var(--border-600))" }}
                              onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={checked}
                                onChange={(e) => toggleOne(p.id, e.target.checked)}
                                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "rgb(var(--primary-600))" }}
                              />
                            </td>
                            <td style={{ padding: "9px 12px", fontSize: 14, borderBottom: "1px solid rgb(var(--border-600))" }}>
                              {name}
                            </td>
                            <td style={{ padding: "9px 12px", fontSize: 13, color: "rgb(var(--text-300))", borderBottom: "1px solid rgb(var(--border-600))" }}>
                              {p.email}
                            </td>
                          </tr>
                        );
                      })}
                      {pagePeople.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ padding: "32px", textAlign: "center", color: "rgb(var(--text-300))", fontSize: 14 }}>
                            {selectorSearch ? "No people match your search." : "No people found matching your filters."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: "14px 24px",
                    borderTop: "1px solid rgb(var(--border-600))",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexShrink: 0,
                    flexWrap: "wrap",
                  }}
                >
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button type="button" className="gg-btn-ghost"
                        disabled={selectorPage === 0}
                        onClick={() => setSelectorPage((p) => p - 1)}
                        style={{ fontSize: 12, padding: "5px 10px" }}>
                        ← Prev
                      </button>
                      <span style={{ fontSize: 13, color: "rgb(var(--text-300))" }}>
                        {selectorPage + 1} / {totalPages}
                      </span>
                      <button type="button" className="gg-btn-ghost"
                        disabled={selectorPage >= totalPages - 1}
                        onClick={() => setSelectorPage((p) => p + 1)}
                        style={{ fontSize: 12, padding: "5px 10px" }}>
                        Next →
                      </button>
                    </div>
                  )}

                  <div style={{ flex: 1 }} />

                  <span style={{ fontSize: 13, color: "rgb(var(--text-300))" }}>
                    {selectedIds.size.toLocaleString()} selected
                  </span>
                  <button
                    type="button"
                    className="gg-btn-success"
                    onClick={confirmSelection}
                    disabled={selectedIds.size === 0}
                    style={{ fontSize: 14, padding: "10px 24px" }}
                  >
                    Confirm Selection ({selectedIds.size.toLocaleString()})
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
