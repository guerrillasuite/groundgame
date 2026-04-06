"use client";

import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Plus, X, Search, ChevronDown, ChevronRight, Map } from "lucide-react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { ColumnDef } from "@/app/api/crm/schema/route";

const LocationMapSelector = dynamic(() => import("@/app/components/LocationMapSelector"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterOp =
  | "contains" | "equals" | "starts_with" | "not_contains"
  | "is_empty" | "not_empty"
  | "greater_than" | "gte" | "less_than" | "lte"
  | "is_true" | "is_false"
  | "in_list" | "not_in_list";

type FilterRow = { id: string; field: string; op: FilterOp; value: string; data_type: string };

export type MapPoint = { id: string; lat: number; lon: number; address?: string };

// ─── Operator sets ────────────────────────────────────────────────────────────

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

const BOOL_OPS: { value: FilterOp; label: string }[] = [
  { value: "is_true",  label: "is true" },
  { value: "is_false", label: "is false" },
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

const NUMERIC_TYPES = new Set(["integer","int","int2","int4","int8","bigint","smallint","numeric","decimal","real","float4","float8","double precision"]);
const NO_VALUE_OPS: FilterOp[] = ["is_empty", "not_empty", "is_true", "is_false"];

function isNumericType(dt: string) { return NUMERIC_TYPES.has(dt); }

function opsForType(dt: string): { value: FilterOp; label: string }[] {
  if (dt === "boolean") return BOOL_OPS;
  if (isNumericType(dt)) return NUM_OPS;
  return TEXT_OPS;
}

function defaultOp(dt: string): FilterOp {
  if (dt === "boolean") return "is_true";
  if (isNumericType(dt)) return "equals";
  return "contains";
}

// ─── Fallback schemas ─────────────────────────────────────────────────────────

const FALLBACK: Record<string, ColumnDef[]> = {
  locations: [
    { column: "address_line1", label: "Street Address",   data_type: "text",  is_join: false },
    { column: "city",          label: "City",             data_type: "text",  is_join: false },
    { column: "state",         label: "State",            data_type: "text",  is_join: false },
    { column: "postal_code",   label: "Zip Code",         data_type: "text",  is_join: false },
    { column: "house_number",  label: "House Number",     data_type: "text",  is_join: false },
    { column: "street_name",   label: "Street Name",      data_type: "text",  is_join: false },
    { column: "county_name",   label: "County",           data_type: "text",  is_join: false },
    { column: "precinct",      label: "Precinct",         data_type: "text",  is_join: false },
    { column: "home_dwelling_type", label: "Dwelling Type", data_type: "text", is_join: false },
    { column: "urbanicity",    label: "Urbanicity",       data_type: "text",  is_join: false },
  ],
  people: [
    { column: "first_name",  label: "First Name",  data_type: "text",     is_join: false },
    { column: "last_name",   label: "Last Name",   data_type: "text",     is_join: false },
    { column: "party",       label: "Party",       data_type: "text",     is_join: false },
    { column: "gender",      label: "Gender",      data_type: "text",     is_join: false },
    { column: "age",         label: "Age",         data_type: "smallint", is_join: false },
    { column: "voter_status",label: "Voter Status",data_type: "text",     is_join: false },
    { column: "likelihood_to_vote", label: "Likelihood to Vote", data_type: "smallint", is_join: false },
    { column: "voted_general_2024", label: "Voted: General 2024", data_type: "boolean", is_join: false },
    { column: "voted_general_2022", label: "Voted: General 2022", data_type: "boolean", is_join: false },
    { column: "ethnicity",   label: "Ethnicity",   data_type: "text",     is_join: false },
  ],
  households: [
    { column: "name",        label: "Household Name", data_type: "text", is_join: false },
    { column: "city",        label: "City",           data_type: "text", is_join: true  },
    { column: "state",       label: "State",          data_type: "text", is_join: true  },
    { column: "postal_code", label: "Zip Code",       data_type: "text", is_join: true  },
  ],
  companies: [
    { column: "name",     label: "Company Name", data_type: "text", is_join: false },
    { column: "phone",    label: "Phone",        data_type: "text", is_join: false },
    { column: "industry", label: "Industry",     data_type: "text", is_join: false },
  ],
};

let _fid = 0;
function mkId() { return `f${++_fid}`; }

// ─── FilterSection ─────────────────────────────────────────────────────────────

function FilterSection({
  title,
  table,
  filters,
  schema,
  loading,
  onChange,
}: {
  title: string;
  table: string;
  filters: FilterRow[];
  schema: ColumnDef[];
  loading: boolean;
  onChange: (f: FilterRow[]) => void;
}) {
  const [open, setOpen] = useState(table === "locations" || table === "people");

  function addRow() {
    const first = schema[0];
    if (!first) return;
    onChange([...filters, { id: mkId(), field: first.column, op: defaultOp(first.data_type), value: "", data_type: first.data_type }]);
  }

  function removeRow(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  function updateRow(id: string, patch: Partial<FilterRow>) {
    onChange(filters.map((f) => {
      if (f.id !== id) return f;
      const next = { ...f, ...patch };
      if (patch.field && patch.field !== f.field) {
        const def = schema.find((c) => c.column === patch.field);
        next.data_type = def?.data_type ?? "text";
        next.op = defaultOp(next.data_type);
        next.value = "";
      }
      return next;
    }));
  }

  const activeCount = filters.filter((f) => f.value || NO_VALUE_OPS.includes(f.op)).length;

  return (
    <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
      <button
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
          {loading && <div style={{ fontSize: 12, color: "var(--gg-text-dim, #9ca3af)" }}>Loading fields…</div>}
          {filters.map((f) => {
            const fieldDef = schema.find((c) => c.column === f.field);
            const ops = opsForType(fieldDef?.data_type ?? f.data_type ?? "text");
            const enumOpts = ENUM_OPTIONS[f.field];
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
                  {schema.filter((c) => !c.is_join).length > 0 && (
                    <optgroup label={title}>
                      {schema.filter((c) => !c.is_join).map((c) => (
                        <option key={c.column} value={c.column}>{c.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {schema.filter((c) => c.is_join).length > 0 && (
                    <optgroup label="Location (joined)">
                      {schema.filter((c) => c.is_join).map((c) => (
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
                <button onClick={() => removeRow(f.id)} style={iconBtnStyle} title="Remove">
                  <X size={13} />
                </button>

                {/* Value row — spans all 3 cols */}
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

          <button onClick={addRow} style={addBtnStyle}>
            <Plus size={12} /> Add filter
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function MapBuilderPanel() {
  const router = useRouter();

  // Schema state per table
  const [schemas, setSchemas] = useState<Record<string, ColumnDef[]>>({
    locations: FALLBACK.locations,
    people: FALLBACK.people,
    households: FALLBACK.households,
    companies: FALLBACK.companies,
  });
  const [schemaLoading, setSchemaLoading] = useState<Record<string, boolean>>({});

  // Filters per table
  const [locFilters, setLocFilters] = useState<FilterRow[]>([
    { id: mkId(), field: "city", op: "contains", value: "", data_type: "text" },
  ]);
  const [peopleFilters, setPeopleFilters] = useState<FilterRow[]>([
    { id: mkId(), field: "party", op: "equals", value: "", data_type: "text" },
  ]);
  const [hhFilters, setHhFilters] = useState<FilterRow[]>([
    { id: mkId(), field: "name", op: "contains", value: "", data_type: "text" },
  ]);
  const [coFilters, setCoFilters] = useState<FilterRow[]>([
    { id: mkId(), field: "name", op: "contains", value: "", data_type: "text" },
  ]);

  const [locations, setLocations] = useState<MapPoint[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // IDs already saved to a list (shown grey)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [showSave, setShowSave] = useState(false);
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // Load all schemas on mount
  useEffect(() => {
    const tables = ["locations", "people", "households", "companies"] as const;
    tables.forEach(async (t) => {
      setSchemaLoading((prev) => ({ ...prev, [t]: true }));
      try {
        const res = await fetch(`/api/crm/schema?table=${t}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSchemas((prev) => ({ ...prev, [t]: data }));
          // Reset first filter field to match loaded schema
          const setters: Record<string, React.Dispatch<React.SetStateAction<FilterRow[]>>> = {
            locations: setLocFilters,
            people: setPeopleFilters,
            households: setHhFilters,
            companies: setCoFilters,
          };
          const setter = setters[t];
          if (setter) {
            setter((prev) => prev.map((f, i) => {
              if (i !== 0) return f;
              const col = data[0];
              return { ...f, field: col.column, data_type: col.data_type, op: defaultOp(col.data_type), value: "" };
            }));
          }
        }
      } catch { /* keep fallback */ }
      finally {
        setSchemaLoading((prev) => ({ ...prev, [t]: false }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function activeFilters(rows: FilterRow[]) {
    return rows.filter((f) => f.field && (f.value.trim() || NO_VALUE_OPS.includes(f.op)));
  }

  async function runSearch() {
    setSearching(true);
    setSearchErr("");
    try {
      const body: any = {
        target: "locations",
        filters: activeFilters(locFilters),
        link_filters: {},
      };

      const pf = activeFilters(peopleFilters);
      if (pf.length) body.link_filters.people = pf;

      const hf = activeFilters(hhFilters);
      if (hf.length) body.link_filters.households = hf;

      const cf = activeFilters(coFilters);
      if (cf.length) body.link_filters.companies = cf;

      if (!Object.keys(body.link_filters).length) delete body.link_filters;

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

      // Mark saved IDs grey, clear selection, dismiss modal
      setSavedIds((prev) => new Set([...prev, ...selectedIds]));
      setSelectedIds(new Set());
      setShowSave(false);
      setListName("");
      setSavedMsg(`Saved "${listName.trim()}" with ${[...selectedIds].length.toLocaleString()} locations.`);
      setTimeout(() => setSavedMsg(""), 5000);
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {savedMsg && (
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 500 }}>{savedMsg}</span>
          )}
          <button
            onClick={() => { setSaveErr(""); setShowSave(true); }}
            disabled={selectedIds.size === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px",
              background: selectedIds.size > 0 ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)",
              color: selectedIds.size > 0 ? "white" : "var(--gg-text-dim, #9ca3af)",
              border: "none", borderRadius: 8, fontWeight: 600, cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
              fontSize: 14,
            }}
          >
            Save as List ({selectedIds.size.toLocaleString()})
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{
          width: 300, flexShrink: 0, borderRight: "1px solid var(--gg-border, #e5e7eb)",
          background: "var(--gg-card, white)", overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 0 }}>

            <FilterSection
              title="Locations"
              table="locations"
              filters={locFilters}
              schema={schemas.locations}
              loading={!!schemaLoading.locations}
              onChange={setLocFilters}
            />
            <FilterSection
              title="People"
              table="people"
              filters={peopleFilters}
              schema={schemas.people}
              loading={!!schemaLoading.people}
              onChange={setPeopleFilters}
            />
            <FilterSection
              title="Households"
              table="households"
              filters={hhFilters}
              schema={schemas.households}
              loading={!!schemaLoading.households}
              onChange={setHhFilters}
            />
            <FilterSection
              title="Companies"
              table="companies"
              filters={coFilters}
              schema={schemas.companies}
              loading={!!schemaLoading.companies}
              onChange={setCoFilters}
            />

            <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={runSearch}
                disabled={searching}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 0", background: "var(--gg-primary, #2563eb)", color: "white",
                  border: "none", borderRadius: 8, fontWeight: 600, cursor: searching ? "not-allowed" : "pointer",
                  opacity: searching ? 0.7 : 1, fontSize: 14,
                }}
              >
                <Search size={15} /> {searching ? "Searching…" : "Search"}
              </button>

              {searchErr && <div style={{ color: "#dc2626", fontSize: 13 }}>{searchErr}</div>}

              {locations.length > 0 && (
                <div style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", display: "flex", flexDirection: "column", gap: 2 }}>
                  <div>{locations.length.toLocaleString()} locations found</div>
                  {savedIds.size > 0 && <div style={{ color: "#9ca3af" }}>{savedIds.size.toLocaleString()} already saved (grey)</div>}
                  <div style={{ fontWeight: 600, color: selectedIds.size > 0 ? "var(--gg-primary, #2563eb)" : undefined }}>{selectedIds.size.toLocaleString()} selected</div>
                </div>
              )}

              {locations.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setSelectedIds(new Set(locations.filter((l) => !savedIds.has(l.id)).map((l) => l.id)))}
                    style={outlineBtnStyle}
                  >
                    Select Unsaved
                  </button>
                  {selectedIds.size > 0 && (
                    <button onClick={() => setSelectedIds(new Set())} style={outlineBtnStyle}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
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
              <div style={{ fontSize: 13 }}>Locations appear as pins · drag-select or click to pick</div>
            </div>
          ) : (
            <LocationMapSelector
              locations={locations}
              selectedIds={selectedIds}
              savedIds={savedIds}
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
                borderRadius: 8, fontSize: 15, outline: "none", boxSizing: "border-box",
              }}
            />
            <p style={{ margin: 0, fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>
              {selectedIds.size.toLocaleString()} location{selectedIds.size !== 1 ? "s" : ""} will be added.
              After saving you can select more locations for another list.
            </p>
            {saveErr && <div style={{ color: "#dc2626", fontSize: 13 }}>{saveErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowSave(false)} style={{ ...outlineBtnStyle, padding: "9px 16px" }}>
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

const outlineBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
  padding: "6px 12px", background: "transparent",
  color: "var(--gg-primary, #2563eb)", border: "1.5px solid var(--gg-primary, #2563eb)",
  borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 12,
};
