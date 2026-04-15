"use client";

import { useState, useCallback } from "react";

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
  audience_type: "segment" | "list";
  audience_list_id: string | null;
  audience_segment_filters: SegmentFilter[] | null;
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

type AudiencePreview = {
  count: number;
  suppressed: number;
} | null;

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

let _id = 0;
function uid() { return `sf${++_id}`; }

type FilterRow = SegmentFilter & { _id: string };

export default function StepAudience({ data, onChange, walklists }: Props) {
  const [preview, setPreview] = useState<AudiencePreview>(null);
  const [previewing, setPreviewing] = useState(false);

  const [filterRows, setFilterRows] = useState<FilterRow[]>(() =>
    data.audience_segment_filters?.map((f) => ({ ...f, _id: uid() })) ?? [
      { _id: uid(), field: "email", op: "not_empty", value: "" },
    ]
  );

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
    } catch {
      // non-critical
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Audience</h2>
        <p style={{ margin: 0, fontSize: 13, color: "rgb(var(--text-300))" }}>
          Choose who receives this campaign.
        </p>
      </div>

      {/* Type toggle */}
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

      {/* Segment filters */}
      {data.audience_type === "segment" && (
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
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 1fr 32px",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                <div>
                  {i === 0 && <label style={labelStyle}>Field</label>}
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={f.field}
                    onChange={(e) => updateFilterRow(f._id, { field: e.target.value })}
                  >
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
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={f.op}
                    onChange={(e) => updateFilterRow(f._id, { op: e.target.value })}
                  >
                    {FILTER_OPS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <label style={labelStyle}>Value</label>}
                  {NO_VALUE_OPS.has(f.op) ? (
                    <div
                      style={{
                        ...inputStyle,
                        color: "rgb(var(--text-300))",
                        fontStyle: "italic",
                      }}
                    >
                      (no value)
                    </div>
                  ) : (
                    <input
                      style={inputStyle}
                      value={f.value}
                      onChange={(e) => updateFilterRow(f._id, { value: e.target.value })}
                      placeholder="Value…"
                    />
                  )}
                </div>
                <button
                  type="button"
                  className="gg-btn-icon"
                  disabled={filterRows.length <= 1}
                  onClick={() => removeFilter(f._id)}
                  style={{ alignSelf: "flex-end" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="gg-btn-ghost" onClick={addFilter} style={{ fontSize: 13 }}>
            + Add Filter
          </button>
        </div>
      )}

      {/* List picker */}
      {data.audience_type === "list" && (
        <div>
          <label style={labelStyle}>Select a List</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={data.audience_list_id ?? ""}
            onChange={(e) => onChange({ audience_list_id: e.target.value || null })}
          >
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
              <a href="/crm/lists" style={{ color: "rgb(var(--primary-600))" }}>
                Lists
              </a>{" "}
              first.
            </p>
          )}
        </div>
      )}

      {/* Preview count */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          className="gg-btn-ghost"
          onClick={fetchPreview}
          disabled={previewing}
          style={{ cursor: previewing ? "wait" : undefined }}
        >
          {previewing ? "Counting…" : "Preview Count"}
        </button>
        {preview && (
          <span style={{ fontSize: 14, color: "rgb(var(--text-100))" }}>
            <strong>{preview.count.toLocaleString()}</strong> recipient
            {preview.count !== 1 ? "s" : ""}
            {preview.suppressed > 0 && (
              <span style={{ color: "rgb(var(--text-300))", marginLeft: 8 }}>
                · {preview.suppressed.toLocaleString()} excluded (unsubscribed or no email)
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
