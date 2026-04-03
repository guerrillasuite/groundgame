"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X, Search, ChevronDown, ChevronRight, Map } from "lucide-react";
import dynamic from "next/dynamic";

const LocationMapSelector = dynamic(() => import("@/app/components/LocationMapSelector"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterOp =
  | "contains" | "equals" | "starts_with" | "not_contains"
  | "is_empty" | "not_empty"
  | "greater_than" | "gte" | "less_than" | "lte"
  | "is_true" | "is_false";

type FilterRow = { id: string; field: string; op: FilterOp; value: string; data_type: string };

export type MapPoint = { id: string; lat: number; lon: number; address?: string };

// ─── Schemas ─────────────────────────────────────────────────────────────────

const LOC_SCHEMA = [
  { column: "city",                    label: "City",                      data_type: "text" },
  { column: "state",                   label: "State",                     data_type: "text" },
  { column: "postal_code",             label: "Zip Code",                  data_type: "text" },
  { column: "address_line1",           label: "Street Address",            data_type: "text" },
  { column: "house_number",            label: "House Number",              data_type: "text" },
  { column: "street_name",             label: "Street Name",               data_type: "text" },
  { column: "congressional_district",  label: "Congressional District",    data_type: "text" },
  { column: "state_senate_district",   label: "State Senate District",     data_type: "text" },
  { column: "state_house_district",    label: "State House District",      data_type: "text" },
  { column: "precinct",                label: "Precinct",                  data_type: "text" },
  { column: "county_name",             label: "County",                    data_type: "text" },
  { column: "home_dwelling_type",      label: "Dwelling Type",             data_type: "text" },
  { column: "urbanicity",              label: "Urbanicity",                data_type: "text" },
];

const PEOPLE_SCHEMA = [
  { column: "party",                  label: "Party",                       data_type: "text" },
  { column: "gender",                 label: "Gender",                      data_type: "text" },
  { column: "age",                    label: "Age",                         data_type: "smallint" },
  { column: "likelihood_to_vote",     label: "Likelihood to Vote (0–100)",  data_type: "smallint" },
  { column: "voted_general_2024",     label: "Voted: General 2024",         data_type: "boolean" },
  { column: "voted_general_2022",     label: "Voted: General 2022",         data_type: "boolean" },
  { column: "voted_primary_2024",     label: "Voted: Primary 2024",         data_type: "boolean" },
  { column: "ethnicity",              label: "Ethnicity",                   data_type: "text" },
  { column: "voter_status",           label: "Voter Status",                data_type: "text" },
  { column: "language",               label: "Language",                    data_type: "text" },
];

// ─── Operators ────────────────────────────────────────────────────────────────

function opsForType(dataType: string): { value: FilterOp; label: string }[] {
  if (dataType === "boolean") {
    return [
      { value: "is_true",  label: "is true" },
      { value: "is_false", label: "is false" },
    ];
  }
  if (dataType === "smallint" || dataType === "integer" || dataType === "float8") {
    return [
      { value: "equals",       label: "equals" },
      { value: "greater_than", label: ">" },
      { value: "gte",          label: ">=" },
      { value: "less_than",    label: "<" },
      { value: "lte",          label: "<=" },
      { value: "is_empty",     label: "is empty" },
      { value: "not_empty",    label: "not empty" },
    ];
  }
  return [
    { value: "contains",    label: "contains" },
    { value: "equals",      label: "equals" },
    { value: "starts_with", label: "starts with" },
    { value: "is_empty",    label: "is empty" },
    { value: "not_empty",   label: "not empty" },
  ];
}

// ─── FilterBuilder sub-component ─────────────────────────────────────────────

function FilterBuilder({
  filters,
  schema,
  onChange,
}: {
  filters: FilterRow[];
  schema: { column: string; label: string; data_type: string }[];
  onChange: (f: FilterRow[]) => void;
}) {
  function addRow() {
    const first = schema[0];
    const ops = opsForType(first.data_type);
    onChange([
      ...filters,
      { id: Math.random().toString(36).slice(2), field: first.column, op: ops[0].value, value: "", data_type: first.data_type },
    ]);
  }

  function removeRow(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  function updateRow(id: string, patch: Partial<FilterRow>) {
    onChange(
      filters.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
        // If field changed, reset op + data_type
        if (patch.field) {
          const col = schema.find((s) => s.column === patch.field);
          if (col) {
            updated.data_type = col.data_type;
            updated.op = opsForType(col.data_type)[0].value;
            updated.value = "";
          }
        }
        return updated;
      })
    );
  }

  const noValue = (op: FilterOp) => op === "is_empty" || op === "not_empty" || op === "is_true" || op === "is_false";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {filters.map((f) => {
        const ops = opsForType(f.data_type);
        return (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 4 }}>
            <select
              value={f.field}
              onChange={(e) => updateRow(f.id, { field: e.target.value })}
              style={selectStyle}
            >
              {schema.map((s) => (
                <option key={s.column} value={s.column}>{s.label}</option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => updateRow(f.id, { op: e.target.value as FilterOp })}
              style={selectStyle}
            >
              {ops.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {noValue(f.op) ? (
              <div />
            ) : (
              <input
                value={f.value}
                onChange={(e) => updateRow(f.id, { value: e.target.value })}
                placeholder="value"
                style={inputStyle}
              />
            )}
            <button onClick={() => removeRow(f.id)} style={iconBtnStyle} title="Remove">
              <X size={14} />
            </button>
          </div>
        );
      })}
      <button onClick={addRow} style={addBtnStyle}>
        <Plus size={13} /> Add filter
      </button>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function MapBuilderPanel() {
  const router = useRouter();

  const [locFilters, setLocFilters] = useState<FilterRow[]>([
    { id: "loc0", field: "city", op: "contains", value: "", data_type: "text" },
  ]);
  const [showPeopleFilters, setShowPeopleFilters] = useState(false);
  const [peopleFilters, setPeopleFilters] = useState<FilterRow[]>([
    { id: "ppl0", field: "party", op: "equals", value: "", data_type: "text" },
  ]);

  const [locations, setLocations] = useState<MapPoint[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [showSave, setShowSave] = useState(false);
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  async function runSearch() {
    setSearching(true);
    setSearchErr("");
    try {
      const body: any = {
        target: "locations",
        filters: locFilters.filter((f) => f.field && (f.value || ["is_empty", "not_empty", "is_true", "is_false"].includes(f.op))),
      };
      if (showPeopleFilters) {
        const pf = peopleFilters.filter((f) => f.field && (f.value || ["is_empty", "not_empty", "is_true", "is_false"].includes(f.op)));
        if (pf.length) body.link_filters = { people: pf };
      }
      const res = await fetch("/api/crm/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Search failed");
      }
      const data: any[] = await res.json();
      const pts = data
        .filter((l) => l.lat != null && l.lon != null)
        .map((l) => ({
          id: l.id,
          lat: l.lat,
          lon: l.lon,
          address: [l.address, l.city, l.state].filter(Boolean).join(", "),
        }));
      setLocations(pts);
      setSelectedIds(new Set());
    } catch (e: any) {
      setSearchErr(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function saveList() {
    if (!listName.trim()) return;
    setSaving(true);
    setSaveErr("");
    try {
      const res = await fetch("/api/crm/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listName.trim(),
          app_mode: "knock",
          target: "locations",
          selected_ids: [...selectedIds],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create list");
      router.push("/crm/lists");
    } catch (e: any) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid var(--gg-border, #e5e7eb)",
        background: "var(--gg-card, white)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/crm/lists")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--gg-primary, #2563eb)", fontWeight: 500, padding: 0 }}
          >
            <ArrowLeft size={16} /> Lists
          </button>
          <span style={{ color: "var(--gg-border, #e5e7eb)" }}>|</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 16 }}>
            <Map size={18} /> Map Builder
          </div>
        </div>
        <button
          onClick={() => { setSaveErr(""); setShowSave(true); }}
          disabled={selectedIds.size === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px",
            background: selectedIds.size > 0 ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)",
            color: selectedIds.size > 0 ? "white" : "var(--gg-text-dim, #9ca3af)",
            border: "none", borderRadius: 8, fontWeight: 600, cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
          }}
        >
          Save as List ({selectedIds.size.toLocaleString()})
        </button>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{
          width: 320, flexShrink: 0, borderRight: "1px solid var(--gg-border, #e5e7eb)",
          background: "var(--gg-card, white)", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 0,
        }}>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Location filters */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)" }}>
                Location Filters
              </div>
              <FilterBuilder filters={locFilters} schema={LOC_SCHEMA} onChange={setLocFilters} />
            </div>

            <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)" }} />

            {/* People filters toggle */}
            <div>
              <button
                onClick={() => setShowPeopleFilters((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)", padding: 0, width: "100%" }}
              >
                {showPeopleFilters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                People Filters
              </button>
              {showPeopleFilters && (
                <div style={{ marginTop: 8 }}>
                  <FilterBuilder filters={peopleFilters} schema={PEOPLE_SCHEMA} onChange={setPeopleFilters} />
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)" }} />

            {/* Search button */}
            <button
              onClick={runSearch}
              disabled={searching}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 0", background: "var(--gg-primary, #2563eb)", color: "white",
                border: "none", borderRadius: 8, fontWeight: 600, cursor: searching ? "not-allowed" : "pointer",
                opacity: searching ? 0.7 : 1,
              }}
            >
              <Search size={15} /> {searching ? "Searching…" : "Search"}
            </button>

            {searchErr && (
              <div style={{ color: "#dc2626", fontSize: 13 }}>{searchErr}</div>
            )}

            {/* Result count */}
            {locations.length > 0 && (
              <div style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
                <div>{locations.length.toLocaleString()} locations found</div>
                <div>{selectedIds.size.toLocaleString()} selected</div>
              </div>
            )}

            {/* Select All */}
            {locations.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setSelectedIds(new Set(locations.map((l) => l.id)))}
                  style={outlineBtnStyle}
                >
                  Select All
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    style={outlineBtnStyle}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {locations.length === 0 && !searching ? (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", color: "var(--gg-text-dim, #9ca3af)",
              gap: 12,
            }}>
              <Map size={48} strokeWidth={1} />
              <div style={{ fontWeight: 600 }}>Set filters and click Search</div>
              <div style={{ fontSize: 13 }}>Locations will appear as pins on the map</div>
            </div>
          ) : (
            <LocationMapSelector
              locations={locations}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
            />
          )}
        </div>
      </div>

      {/* Save modal */}
      {showSave && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "var(--gg-card, white)", borderRadius: 12, padding: 28,
            width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Save as Walk List</h3>
            <input
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveList()}
              placeholder="List name…"
              autoFocus
              style={{
                width: "100%", padding: "10px 12px", border: "1.5px solid var(--gg-border, #e5e7eb)",
                borderRadius: 8, fontSize: 15, outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p style={{ margin: 0, fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>
              {selectedIds.size.toLocaleString()} location{selectedIds.size !== 1 ? "s" : ""} will be added to this list.
            </p>
            {saveErr && <div style={{ color: "#dc2626", fontSize: 13 }}>{saveErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowSave(false)}
                style={{ ...outlineBtnStyle, padding: "9px 16px" }}
              >
                Cancel
              </button>
              <button
                onClick={saveList}
                disabled={saving || !listName.trim()}
                style={{
                  padding: "9px 20px", background: "var(--gg-primary, #2563eb)", color: "white",
                  border: "none", borderRadius: 8, fontWeight: 600,
                  cursor: saving || !listName.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !listName.trim() ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "5px 6px", border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 6, fontSize: 12, background: "white", width: "100%",
};

const inputStyle: React.CSSProperties = {
  padding: "5px 6px", border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 6, fontSize: 12, width: "100%",
};

const iconBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", cursor: "pointer",
  color: "var(--gg-text-dim, #9ca3af)", padding: 4, borderRadius: 4,
};

const addBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "none", border: "1px dashed var(--gg-border, #e5e7eb)",
  borderRadius: 6, padding: "5px 10px", cursor: "pointer",
  fontSize: 12, color: "var(--gg-text-dim, #6b7280)",
};

const outlineBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
  padding: "7px 14px", background: "transparent",
  color: "var(--gg-primary, #2563eb)", border: "1.5px solid var(--gg-primary, #2563eb)",
  borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};
