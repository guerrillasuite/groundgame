"use client";

import { useState, useEffect, useCallback } from "react";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 5,
  color: "var(--gg-text-dim, #6b7280)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
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
  // People
  { key: "email",           label: "Email",                group: "Person" },
  { key: "first_name",      label: "First Name",           group: "Person" },
  { key: "last_name",       label: "Last Name",            group: "Person" },
  // Location (via household → location)
  { key: "city",            label: "City",                 group: "Location" },
  { key: "state",           label: "State",                group: "Location" },
  { key: "postal_code",     label: "ZIP Code",             group: "Location" },
  // Company (via person_companies → companies)
  { key: "company.name",    label: "Company Name",         group: "Company" },
  { key: "company.industry", label: "Company Industry",   group: "Company" },
  { key: "company.status",  label: "Company Status",       group: "Company" },
  // Opportunity (via opportunities.contact_person_id)
  { key: "opp.stage",       label: "Opportunity Stage",    group: "Opportunity" },
  { key: "opp.pipeline",    label: "Opportunity Pipeline", group: "Opportunity" },
  { key: "opp.source",      label: "Opportunity Source",   group: "Opportunity" },
  { key: "opp.priority",    label: "Opportunity Priority", group: "Opportunity" },
];

const FILTER_OPS = [
  { value: "contains",   label: "Contains" },
  { value: "equals",     label: "Is" },
  { value: "starts_with", label: "Starts with" },
  { value: "not_empty",  label: "Has a value" },
  { value: "is_empty",   label: "Is empty" },
];

const NO_VALUE_OPS = new Set(["is_empty", "not_empty"]);

let _id = 0;
function uid() { return `sf${++_id}`; }

type FilterRow = SegmentFilter & { _id: string };

export default function StepAudience({ data, onChange, walklists }: Props) {
  const [preview, setPreview] = useState<AudiencePreview>(null);
  const [previewing, setPreviewing] = useState(false);

  // Internal filter rows with local IDs for keying
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
      // preview is non-critical
    } finally {
      setPreviewing(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: 7,
    border: active ? "none" : "1px solid var(--gg-border, #e5e7eb)",
    background: active ? "var(--gg-primary, #2563eb)" : "var(--gg-card, white)",
    color: active ? "white" : "inherit",
    fontWeight: active ? 600 : 400,
    fontSize: 14,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Audience</h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
          Choose who receives this campaign.
        </p>
      </div>

      {/* Type toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          style={tabStyle(data.audience_type === "segment")}
          onClick={() => onChange({ audience_type: "segment" })}
        >
          Filter by Field
        </button>
        <button
          type="button"
          style={tabStyle(data.audience_type === "list")}
          onClick={() => onChange({ audience_type: "list" })}
        >
          Saved List
        </button>
      </div>

      {/* Segment filters */}
      {data.audience_type === "segment" && (
        <div
          style={{
            background: "var(--gg-card, white)",
            border: "1px solid var(--gg-border, #e5e7eb)",
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
                        background: "var(--gg-bg, #f9fafb)",
                        color: "var(--gg-text-dim, #9ca3af)",
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
                  disabled={filterRows.length <= 1}
                  onClick={() => removeFilter(f._id)}
                  style={{
                    padding: 6,
                    background: "none",
                    border: "1px solid var(--gg-border, #e5e7eb)",
                    borderRadius: 6,
                    cursor: filterRows.length <= 1 ? "default" : "pointer",
                    color: filterRows.length <= 1 ? "var(--gg-border, #d1d5db)" : "var(--gg-text-dim, #6b7280)",
                    height: 37,
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addFilter}
            style={{
              padding: "7px 14px",
              borderRadius: 7,
              border: "1px solid var(--gg-border, #e5e7eb)",
              background: "transparent",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
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
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
              No walklists found. Create one in{" "}
              <a href="/crm/lists" style={{ color: "var(--gg-primary, #2563eb)" }}>
                Lists
              </a>{" "}
              first.
            </p>
          )}
        </div>
      )}

      {/* Preview count button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={fetchPreview}
          disabled={previewing}
          style={{
            padding: "8px 16px",
            borderRadius: 7,
            border: "1px solid var(--gg-border, #e5e7eb)",
            background: "transparent",
            fontSize: 13,
            fontWeight: 600,
            cursor: previewing ? "wait" : "pointer",
          }}
        >
          {previewing ? "Counting…" : "Preview Count"}
        </button>
        {preview && (
          <span style={{ fontSize: 14 }}>
            <strong>{preview.count.toLocaleString()}</strong> recipient
            {preview.count !== 1 ? "s" : ""}
            {preview.suppressed > 0 && (
              <span style={{ color: "var(--gg-text-dim, #6b7280)", marginLeft: 8 }}>
                · {preview.suppressed.toLocaleString()} excluded (unsubscribed or no email)
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
