"use client";

import { useState } from "react";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import type { ColumnDef } from "@/app/api/crm/schema/route";

// ─── Exported types ───────────────────────────────────────────────────────────

export type FilterOp =
  | "contains" | "equals" | "starts_with" | "not_contains"
  | "is_empty" | "not_empty"
  | "greater_than" | "gte" | "less_than" | "lte"
  | "is_true" | "is_false"
  | "in_list" | "not_in_list";

export type FilterRow = {
  id: string;
  field: string;
  op: FilterOp;
  value: string;
  data_type: string;
};

// ─── Operator sets ────────────────────────────────────────────────────────────

export const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains",     label: "contains" },
  { value: "equals",       label: "equals" },
  { value: "in_list",      label: "is any of" },
  { value: "not_in_list",  label: "is none of" },
  { value: "starts_with",  label: "starts with" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty",     label: "is empty" },
  { value: "not_empty",    label: "is not empty" },
];

export const NUM_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals",       label: "=" },
  { value: "greater_than", label: ">" },
  { value: "gte",          label: "≥" },
  { value: "less_than",    label: "<" },
  { value: "lte",          label: "≤" },
  { value: "is_empty",     label: "is empty" },
  { value: "not_empty",    label: "is not empty" },
];

export const BOOL_OPS: { value: FilterOp; label: string }[] = [
  { value: "is_true",  label: "is true" },
  { value: "is_false", label: "is false" },
];

export const NO_VALUE_OPS: FilterOp[] = ["is_empty", "not_empty", "is_true", "is_false"];

export const NUMERIC_TYPES = new Set([
  "integer", "int", "int2", "int4", "int8",
  "bigint", "smallint", "numeric", "decimal",
  "real", "float4", "float8", "double precision",
]);

export function isNumericType(dt: string) { return NUMERIC_TYPES.has(dt); }

export const TAG_ARRAY_OPS: { value: FilterOp; label: string }[] = [
  { value: "in_list",     label: "has any of" },
  { value: "not_in_list", label: "has none of" },
  { value: "is_empty",    label: "has no tags" },
  { value: "not_empty",   label: "has any tag" },
];

export function opsForType(dt: string): { value: FilterOp; label: string }[] {
  if (dt === "boolean") return BOOL_OPS;
  if (isNumericType(dt)) return NUM_OPS;
  if (dt === "tag_array") return TAG_ARRAY_OPS;
  return TEXT_OPS;
}

export function defaultOp(dt: string): FilterOp {
  if (dt === "boolean") return "is_true";
  if (isNumericType(dt)) return "equals";
  if (dt === "tag_array") return "in_list";
  return "contains";
}

// ─── Enum options ─────────────────────────────────────────────────────────────

export const ENUM_OPTIONS: Record<string, string[]> = {
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
  priority:         ["high", "medium", "low"],
  state:            ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"],
};

// ─── ID generator ─────────────────────────────────────────────────────────────

let _fid = 0;
export function makeFilterId() { return `f${++_fid}`; }

// ─── FilterSection component ──────────────────────────────────────────────────

type Props = {
  title: string;
  filters: FilterRow[];
  schema: ColumnDef[];
  loading?: boolean;
  onChange: (f: FilterRow[]) => void;
  /** Hide is_join columns — use for People/HH/Co sections where location join fields are irrelevant */
  hideJoined?: boolean;
  /** Start expanded */
  defaultOpen?: boolean;
  /** Override enum options for specific fields (e.g. { stage: ["lead", "won"] }) */
  dynamicEnumOpts?: Record<string, string[]>;
  /** Label to use for the primary optgroup (defaults to title) */
  groupLabel?: string;
};

export default function FilterSection({
  title,
  filters,
  schema,
  loading = false,
  onChange,
  hideJoined = false,
  defaultOpen = false,
  dynamicEnumOpts = {},
  groupLabel,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const visibleSchema = hideJoined ? schema.filter((c) => !c.is_join) : schema;
  const directCols = visibleSchema.filter((c) => !c.is_join);
  const joinedCols = visibleSchema.filter((c) => c.is_join);

  // Count filters that have an active value
  const activeCount = filters.filter(
    (f) => f.value.trim() || NO_VALUE_OPS.includes(f.op)
  ).length;

  function addRow() {
    const first = visibleSchema[0];
    if (!first) return;
    onChange([
      ...filters,
      { id: makeFilterId(), field: first.column, op: defaultOp(first.data_type), value: "", data_type: first.data_type },
    ]);
  }

  function removeRow(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  function updateRow(id: string, patch: Partial<FilterRow>) {
    onChange(
      filters.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        if (patch.field && patch.field !== f.field) {
          const def = visibleSchema.find((c) => c.column === patch.field);
          next.data_type = def?.data_type ?? "text";
          next.op = defaultOp(next.data_type);
          next.value = "";
        }
        return next;
      })
    );
  }

  function getEnumOpts(field: string): string[] | undefined {
    return dynamicEnumOpts[field] ?? ENUM_OPTIONS[field];
  }

  return (
    <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", cursor: "pointer",
          padding: "10px 0", fontWeight: 600, fontSize: 12,
          textTransform: "uppercase", letterSpacing: "0.05em",
          color: "var(--gg-text-dim, #6b7280)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {title}
          {activeCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
              background: "var(--gg-primary, #2563eb)", color: "white",
            }}>{activeCount}</span>
          )}
        </span>
      </button>

      {open && (
        <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {loading && (
            <div style={{ fontSize: 12, color: "var(--gg-text-dim, #9ca3af)" }}>Loading fields…</div>
          )}

          {filters.map((f) => {
            const fieldDef = visibleSchema.find((c) => c.column === f.field);
            const ops = opsForType(fieldDef?.data_type ?? f.data_type ?? "text");
            const enumOpts = getEnumOpts(f.field);
            const noVal = NO_VALUE_OPS.includes(f.op);
            const numeric = isNumericType(f.data_type ?? "text");

            return (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 4 }}>
                {/* Field */}
                <select
                  value={f.field}
                  onChange={(e) => updateRow(f.id, { field: e.target.value })}
                  style={selectSm}
                >
                  {directCols.length > 0 && (
                    <optgroup label={groupLabel ?? title}>
                      {directCols.map((c) => (
                        <option key={c.column} value={c.column}>{c.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {!hideJoined && joinedCols.length > 0 && (
                    <optgroup label="Location (joined)">
                      {joinedCols.map((c) => (
                        <option key={c.column} value={c.column}>{c.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {/* Op */}
                <select
                  value={f.op}
                  onChange={(e) => updateRow(f.id, { op: e.target.value as FilterOp })}
                  style={selectSm}
                >
                  {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeRow(f.id)}
                  style={iconBtnStyle}
                  title="Remove filter"
                >
                  <X size={13} />
                </button>

                {/* Value — spans all 3 cols */}
                {!noVal && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    {(f.op === "in_list" || f.op === "not_in_list") && enumOpts ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {enumOpts.map((v) => {
                          const selected = new Set(f.value.split(",").map((x) => x.trim()).filter(Boolean));
                          const on = selected.has(v);
                          const isExclude = f.op === "not_in_list";
                          const activeColor = isExclude ? "#dc2626" : "var(--gg-primary, #2563eb)";
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                const next = new Set(selected);
                                if (on) next.delete(v); else next.add(v);
                                updateRow(f.id, { value: [...next].join(",") });
                              }}
                              style={{
                                padding: "3px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                                border: `1px solid ${on ? activeColor : "var(--gg-border, #e5e7eb)"}`,
                                background: on ? (isExclude ? "rgba(220,38,38,0.08)" : "rgba(37,99,235,0.08)") : "white",
                                color: on ? activeColor : "var(--gg-text-dim, #6b7280)",
                                fontWeight: on ? 600 : 400,
                              }}
                            >{v}</button>
                          );
                        })}
                      </div>
                    ) : (f.op === "in_list" || f.op === "not_in_list") ? (
                      <input
                        value={f.value}
                        onChange={(e) => updateRow(f.id, { value: e.target.value })}
                        placeholder="value1, value2, …"
                        style={inputSm}
                      />
                    ) : enumOpts ? (
                      <select
                        value={f.value}
                        onChange={(e) => updateRow(f.id, { value: e.target.value })}
                        style={selectSm}
                      >
                        <option value="">— select —</option>
                        {enumOpts.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input
                        type={numeric ? "number" : "text"}
                        value={f.value}
                        onChange={(e) => updateRow(f.id, { value: e.target.value })}
                        placeholder="Filter value…"
                        style={inputSm}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={addRow} style={addBtnStyle}>
            <Plus size={12} /> Add filter
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const selectSm: React.CSSProperties = {
  padding: "5px 6px", border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 6, fontSize: 12, background: "white", width: "100%",
};

const inputSm: React.CSSProperties = {
  padding: "5px 6px", border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 6, fontSize: 12, width: "100%", boxSizing: "border-box",
};

const iconBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", cursor: "pointer",
  color: "var(--gg-text-dim, #9ca3af)", padding: 4, borderRadius: 4, flexShrink: 0,
};

const addBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "none", border: "1px dashed var(--gg-border, #e5e7eb)",
  borderRadius: 6, padding: "5px 10px", cursor: "pointer",
  fontSize: 12, color: "var(--gg-text-dim, #6b7280)",
};
