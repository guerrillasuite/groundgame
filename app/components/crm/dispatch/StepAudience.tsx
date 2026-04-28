"use client";

import { useState, useRef, useEffect } from "react";
import FilterSection, {
  type FilterRow,
  makeFilterId,
  defaultOp,
  NO_VALUE_OPS as FS_NO_VALUE_OPS,
} from "@/app/components/crm/FilterSection";
import type { ColumnDef } from "@/app/api/crm/schema/route";

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
  data_type?: string;
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

// ── Simple (curated) field list ───────────────────────────────────────────────

const SIMPLE_FIELDS = [
  { key: "email",       label: "Email",               group: "Person" },
  { key: "first_name",  label: "First Name",           group: "Person" },
  { key: "last_name",   label: "Last Name",            group: "Person" },
  { key: "contact_type",label: "Contact Type",         group: "Person" },
  { key: "tags",        label: "Tags",                 group: "Person" },
  { key: "party",       label: "Party",                group: "Person" },
  { key: "votes_history.2024_presidential_general", label: "Voted 2024 General",  group: "Voting" },
  { key: "votes_history.2024_presidential_primary",  label: "Voted 2024 Primary",  group: "Voting" },
  { key: "votes_history.2022_midterm_general",        label: "Voted 2022 Midterm",  group: "Voting" },
  { key: "votes_history.2020_presidential_general",  label: "Voted 2020 General",  group: "Voting" },
  { key: "city",        label: "City",                 group: "Location" },
  { key: "state",       label: "State",                group: "Location" },
  { key: "postal_code", label: "ZIP Code",             group: "Location" },
];
const SIMPLE_GROUPS = ["Person", "Voting", "Location"];

const SIMPLE_OPS = [
  { value: "contains",     label: "Contains" },
  { value: "equals",       label: "Is" },
  { value: "not_contains", label: "Does not contain" },
  { value: "starts_with",  label: "Starts with" },
  { value: "not_empty",    label: "Has a value" },
  { value: "is_empty",     label: "Is empty" },
];

const SIMPLE_NO_VALUE_OPS = new Set(["is_empty", "not_empty"]);

const STATIC_ENUM_OPTS: Record<string, string[]> = {
  party: ["DEM", "REP", "IND", "NPA", "LIB", "GRN", "OTH"],
  "votes_history.2024_presidential_general": ["Y", "N", "A", "E"],
  "votes_history.2024_presidential_primary":  ["Y", "N", "A", "E"],
  "votes_history.2022_midterm_general":        ["Y", "N", "A", "E"],
  "votes_history.2020_presidential_general":  ["Y", "N", "A", "E"],
};

// ── Fallback schemas (used before API loads) ──────────────────────────────────

const FALLBACK_PEOPLE: ColumnDef[] = [
  { column: "first_name",   label: "First Name",   data_type: "text",    is_join: false },
  { column: "last_name",    label: "Last Name",    data_type: "text",    is_join: false },
  { column: "email",        label: "Email",        data_type: "text",    is_join: false },
  { column: "contact_type", label: "Contact Type", data_type: "text",    is_join: false },
  { column: "party",        label: "Party",        data_type: "text",    is_join: false },
  { column: "city",             label: "City",               data_type: "text",             is_join: true  },
  { column: "state",            label: "State",              data_type: "text",             is_join: true  },
  { column: "postal_code",      label: "ZIP Code",           data_type: "text",             is_join: true  },
  { column: "tags",             label: "Tags",               data_type: "tag_array",        is_join: false },
  { column: "tp_created_at",    label: "Date Added to CRM",  data_type: "timestamp",        is_join: false },
  { column: "tp_updated_at",    label: "Last Updated in CRM",data_type: "timestamp",        is_join: false },
  { column: "completed_survey", label: "Completed Survey",   data_type: "survey_completion",is_join: false },
];
const FALLBACK_HH: ColumnDef[] = [
  { column: "total_persons",        label: "Total Persons",    data_type: "smallint", is_join: false },
  { column: "household_voter_count",label: "Voter Count",      data_type: "smallint", is_join: false },
  { column: "has_senior",           label: "Has Senior",       data_type: "boolean",  is_join: false },
  { column: "has_children",         label: "Has Children",     data_type: "boolean",  is_join: false },
  { column: "home_owner",           label: "Home Owner",       data_type: "boolean",  is_join: false },
  { column: "home_estimated_value", label: "Est. Home Value",  data_type: "integer",  is_join: false },
];

const PER_PAGE = 50;

// ── Indeterminate checkbox ────────────────────────────────────────────────────

function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input type="checkbox" ref={ref} checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "rgb(var(--primary-600))" }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StepAudience({ data, onChange, walklists }: Props) {
  const [preview, setPreview] = useState<AudiencePreview>(null);
  const [previewing, setPreviewing] = useState(false);

  // ── Advanced filter schema state ──────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [peopleSchema, setPeopleSchema] = useState<ColumnDef[]>(FALLBACK_PEOPLE);
  const [hhSchema, setHhSchema] = useState<ColumnDef[]>(FALLBACK_HH);
  const [contactTypeOpts, setContactTypeOpts] = useState<string[]>([]);
  const [tagOpts, setTagOpts] = useState<string[]>([]);
  const [surveyOpts, setSurveyOpts] = useState<string[]>([]);

  // ── Filter state ──────────────────────────────────────────────────────────
  // peopleFilters drives both simple and advanced People section
  const [peopleFilters, setPeopleFilters] = useState<FilterRow[]>(() => {
    const existing = (data.audience_segment_filters ?? []).filter(
      (f) => !HH_FIELDS.has(f.field)
    );
    return existing.length > 0
      ? existing.map((f) => ({ id: makeFilterId(), field: f.field, op: (f.op || "contains") as any, value: f.value ?? "", data_type: f.data_type ?? "text" }))
      : [{ id: makeFilterId(), field: "email", op: "not_empty" as any, value: "", data_type: "text" }];
  });
  // hhFilters only used in advanced mode
  const [hhFilters, setHhFilters] = useState<FilterRow[]>(() => {
    const existing = (data.audience_segment_filters ?? []).filter(
      (f) => HH_FIELDS.has(f.field)
    );
    return existing.map((f) => ({ id: makeFilterId(), field: f.field, op: (f.op || "contains") as any, value: f.value ?? "", data_type: f.data_type ?? "text" }));
  });

  // ── Modal state ───────────────────────────────────────────────────────────
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [allPeople, setAllPeople] = useState<PersonRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(data.audience_person_ids ?? [])
  );
  const [selectorPage, setSelectorPage] = useState(0);
  const [selectorSearch, setSelectorSearch] = useState("");

  // ── Fetch contact types and tags on mount ────────────────────────────────
  useEffect(() => {
    fetch("/api/crm/settings/contact-types")
      .then((r) => r.json())
      .then((types: Array<{ key: string }>) => {
        if (Array.isArray(types)) setContactTypeOpts(types.map((t) => t.key));
      })
      .catch(() => {});
    fetch("/api/crm/tags")
      .then((r) => r.json())
      .then((tags: Array<{ name: string }>) => {
        if (Array.isArray(tags)) setTagOpts(tags.map((t) => t.name).filter(Boolean));
      })
      .catch(() => {});
    fetch("/api/survey")
      .then((r) => r.json())
      .then((surveys: Array<{ title: string }>) => {
        if (Array.isArray(surveys)) setSurveyOpts(surveys.map((s) => s.title).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  // ── Load full schemas (lazy — on first "Advanced Fields" click) ───────────
  function openAdvanced() {
    if (!schemaLoaded) {
      Promise.all([
        fetch("/api/crm/schema?table=people").then((r) => r.json()),
        fetch("/api/crm/schema?table=households").then((r) => r.json()),
      ]).then(([pSch, hhSch]) => {
        if (Array.isArray(pSch) && pSch.length) setPeopleSchema(pSch);
        if (Array.isArray(hhSch) && hhSch.length) setHhSchema(hhSch);
        setSchemaLoaded(true);
      }).catch(() => setSchemaLoaded(true));
    }
    setShowAdvanced(true);
  }

  // ── Sync helpers ──────────────────────────────────────────────────────────
  function syncAll(people: FilterRow[], hh: FilterRow[]) {
    const all = [...people, ...hh];
    onChange({
      audience_segment_filters: all.map(({ field, op, value, data_type }) => ({ field, op, value, data_type })),
    });
  }

  // ── Simple mode filter operations ─────────────────────────────────────────
  function addFilter() {
    const next = [...peopleFilters, { id: makeFilterId(), field: "email", op: "contains" as any, value: "", data_type: "text" }];
    setPeopleFilters(next);
    syncAll(next, hhFilters);
  }

  function removeFilter(id: string) {
    if (peopleFilters.length <= 1) return;
    const next = peopleFilters.filter((f) => f.id !== id);
    setPeopleFilters(next);
    syncAll(next, hhFilters);
  }

  function updateFilter(id: string, patch: Partial<FilterRow>) {
    const next = peopleFilters.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setPeopleFilters(next);
    syncAll(next, hhFilters);
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

  // ── People selector ───────────────────────────────────────────────────────
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
      if (data.audience_type !== "manual") {
        setSelectedIds(new Set(people.map((p) => p.id)));
      }
    } catch { setAllPeople([]); }
    finally { setLoadingPeople(false); }
  }

  function confirmSelection() {
    onChange({ audience_type: "manual", audience_person_ids: Array.from(selectedIds) });
    setSelectorOpen(false);
  }

  function clearManual() {
    onChange({ audience_type: "segment", audience_person_ids: null });
  }

  // ── Selector derived values ───────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────

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
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
          borderRadius: 8, flexWrap: "wrap",
        }}>
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

      {/* Type toggle */}
      {!isManual && (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button"
            className={data.audience_type === "segment" ? "gg-btn-tab-active" : "gg-btn-tab"}
            onClick={() => onChange({ audience_type: "segment" })}>
            Filter by Field
          </button>
          <button type="button"
            className={data.audience_type === "list" ? "gg-btn-tab-active" : "gg-btn-tab"}
            onClick={() => onChange({ audience_type: "list" })}>
            Saved List
          </button>
        </div>
      )}

      {/* Segment filters */}
      {!isManual && data.audience_type === "segment" && (
        <div style={{
          background: "rgb(var(--card-700))",
          border: "1px solid rgb(var(--border-600))",
          borderRadius: 10,
          padding: 20,
          display: "grid",
          gap: 14,
        }}>
          {!showAdvanced ? (
            /* ── Simple filter rows ── */
            <>
              <div style={{ display: "grid", gap: 10 }}>
                {peopleFilters.map((f, i) => (
                  <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 1fr 32px", gap: 8, alignItems: "end" }}>
                    <div>
                      {i === 0 && <label style={labelStyle}>Field</label>}
                      <select style={{ ...inputStyle, cursor: "pointer" }} value={f.field}
                        onChange={(e) => {
                          const newField = e.target.value;
                          const patch: Partial<FilterRow> = { field: newField, value: "" };
                          if (newField === "tags") patch.op = "in_list" as any;
                          updateFilter(f.id, patch);
                        }}>
                        {SIMPLE_GROUPS.map((group) => (
                          <optgroup key={group} label={group}>
                            {SIMPLE_FIELDS.filter((ff) => ff.group === group).map((ff) => (
                              <option key={ff.key} value={ff.key}>{ff.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Condition</label>}
                      {f.field === "tags" ? (
                        <select style={{ ...inputStyle, cursor: "pointer" }} value={f.op}
                          onChange={(e) => updateFilter(f.id, { op: e.target.value as any })}>
                          <option value="in_list">Has any of</option>
                          <option value="not_in_list">Has none of</option>
                          <option value="not_empty">Has any tag</option>
                          <option value="is_empty">Has no tags</option>
                        </select>
                      ) : (
                        <select style={{ ...inputStyle, cursor: "pointer" }} value={f.op}
                          onChange={(e) => updateFilter(f.id, { op: e.target.value as any })}>
                          {SIMPLE_OPS.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Value</label>}
                      {SIMPLE_NO_VALUE_OPS.has(f.op) ? (
                        <div style={{ ...inputStyle, color: "rgb(var(--text-300))", fontStyle: "italic" }}>(no value)</div>
                      ) : f.field === "tags" && (f.op === "in_list" || f.op === "not_in_list") ? (
                        tagOpts.length === 0 ? (
                          <div style={{ ...inputStyle, fontSize: 12, color: "rgb(var(--text-300))", fontStyle: "italic" }}>
                            No tags created yet
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "4px 0" }}>
                            {tagOpts.map((tag) => {
                              const selected = new Set(f.value.split(",").map((v) => v.trim()).filter(Boolean));
                              const on = selected.has(tag);
                              const isExclude = f.op === "not_in_list";
                              const activeColor = isExclude ? "#dc2626" : "rgb(var(--primary-600))";
                              return (
                                <button key={tag} type="button"
                                  onClick={() => {
                                    const next = new Set(selected);
                                    if (on) next.delete(tag); else next.add(tag);
                                    updateFilter(f.id, { value: [...next].join(",") });
                                  }}
                                  style={{
                                    padding: "3px 9px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                                    border: `1px solid ${on ? activeColor : "rgb(var(--border-600))"}`,
                                    background: on ? (isExclude ? "rgba(220,38,38,0.1)" : "rgba(37,99,235,0.1)") : "rgb(var(--card-700))",
                                    color: on ? activeColor : "rgb(var(--text-300))",
                                    fontWeight: on ? 600 : 400,
                                  }}>
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        )
                      ) : (() => {
                        const enumOpts = f.field === "contact_type"
                          ? contactTypeOpts
                          : (STATIC_ENUM_OPTS[f.field] ?? null);
                        if (enumOpts && enumOpts.length > 0) {
                          return (
                            <select style={{ ...inputStyle, cursor: "pointer" }} value={f.value}
                              onChange={(e) => updateFilter(f.id, { value: e.target.value })}>
                              <option value="">— Any —</option>
                              {enumOpts.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          );
                        }
                        return (
                          <input style={inputStyle} value={f.value}
                            onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                            placeholder="Value…" />
                        );
                      })()}
                    </div>
                    <button type="button" className="gg-btn-icon"
                      disabled={peopleFilters.length <= 1}
                      onClick={() => removeFilter(f.id)}
                      style={{ alignSelf: "flex-end" }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="gg-btn-ghost" onClick={addFilter} style={{ fontSize: 13 }}>
                  + Add Filter
                </button>
                <button type="button" className="gg-btn-ghost" onClick={openAdvanced}
                  style={{ fontSize: 13, marginLeft: "auto", color: "rgb(var(--primary-600))" }}>
                  Advanced Fields ▾
                </button>
              </div>
            </>
          ) : (
            /* ── Advanced: full FilterSection ── */
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" className="gg-btn-ghost"
                  onClick={() => setShowAdvanced(false)}
                  style={{ fontSize: 12 }}>
                  ← Simple Filters
                </button>
                <span style={{ fontSize: 12, color: "rgb(var(--text-300))" }}>
                  Filter by any field in the database
                </span>
              </div>
              <FilterSection
                title="People"
                filters={peopleFilters}
                schema={peopleSchema}
                onChange={(rows) => { setPeopleFilters(rows); syncAll(rows, hhFilters); }}
                defaultOpen
                hideJoined={false}
                dynamicEnumOpts={{ contact_type: contactTypeOpts, tags: tagOpts, completed_survey: surveyOpts }}
              />
              <FilterSection
                title="Household"
                filters={hhFilters}
                schema={hhSchema}
                onChange={(rows) => { setHhFilters(rows); syncAll(peopleFilters, rows); }}
                hideJoined={false}
              />
            </>
          )}
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
          <button type="button" className="gg-btn-primary" onClick={openSelector} style={{ fontSize: 13 }}>
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

      {/* ── Confirm Selection Modal ─────────────────────────────────────── */}
      {selectorOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectorOpen(false); }}
        >
          <div style={{
            background: "rgb(var(--card-700))", border: "1px solid rgb(var(--border-600))",
            borderRadius: 14, width: "min(92vw, 720px)", maxHeight: "85vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)", overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgb(var(--border-600))", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Select Recipients</h3>
                {!loadingPeople && (
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "rgb(var(--text-300))" }}>
                    {filteredPeople.length.toLocaleString()} matched ·{" "}
                    <strong style={{ color: "rgb(var(--text-100))" }}>{selectedIds.size.toLocaleString()} selected</strong>
                  </p>
                )}
              </div>
              <button type="button" className="gg-btn-ghost" onClick={() => setSelectorOpen(false)} style={{ fontSize: 12, padding: "4px 10px" }}>
                Cancel
              </button>
            </div>

            {loadingPeople ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgb(var(--text-300))", fontSize: 14, padding: 48 }}>
                Loading recipients…
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div style={{ padding: "12px 24px", borderBottom: "1px solid rgb(var(--border-600))", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
                  <button type="button" className="gg-btn-ghost" onClick={() => toggleAll(true)} style={{ fontSize: 12, padding: "5px 12px" }}>
                    Select All ({filteredPeople.length.toLocaleString()})
                  </button>
                  <button type="button" className="gg-btn-ghost" onClick={() => toggleAll(false)} style={{ fontSize: 12, padding: "5px 12px" }}>
                    Deselect All
                  </button>
                  <input type="text" placeholder="Search by name or email…" value={selectorSearch}
                    onChange={(e) => { setSelectorSearch(e.target.value); setSelectorPage(0); }}
                    style={{ ...inputStyle, width: "auto", flex: 1, minWidth: 160, fontSize: 13, padding: "6px 10px" }}
                  />
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "rgb(var(--card-700))", zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: "8px 16px", width: 40, borderBottom: "1px solid rgb(var(--border-600))" }}>
                          <IndeterminateCheckbox checked={allOnPageSelected} indeterminate={!allOnPageSelected && someOnPageSelected} onChange={togglePage} />
                        </th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-300))", borderBottom: "1px solid rgb(var(--border-600))" }}>Name</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-300))", borderBottom: "1px solid rgb(var(--border-600))" }}>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagePeople.map((p) => {
                        const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "(No name)";
                        const checked = selectedIds.has(p.id);
                        return (
                          <tr key={p.id} onClick={() => toggleOne(p.id, !checked)}
                            style={{ cursor: "pointer", background: checked ? "rgba(37,99,235,0.07)" : "transparent", transition: "background .1s" }}>
                            <td style={{ padding: "9px 16px", borderBottom: "1px solid rgb(var(--border-600))" }} onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={checked} onChange={(e) => toggleOne(p.id, e.target.checked)}
                                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "rgb(var(--primary-600))" }} />
                            </td>
                            <td style={{ padding: "9px 12px", fontSize: 14, borderBottom: "1px solid rgb(var(--border-600))" }}>{name}</td>
                            <td style={{ padding: "9px 12px", fontSize: 13, color: "rgb(var(--text-300))", borderBottom: "1px solid rgb(var(--border-600))" }}>{p.email}</td>
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
                <div style={{ padding: "14px 24px", borderTop: "1px solid rgb(var(--border-600))", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
                  {totalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button type="button" className="gg-btn-ghost" disabled={selectorPage === 0}
                        onClick={() => setSelectorPage((p) => p - 1)} style={{ fontSize: 12, padding: "5px 10px" }}>← Prev</button>
                      <span style={{ fontSize: 13, color: "rgb(var(--text-300))" }}>{selectorPage + 1} / {totalPages}</span>
                      <button type="button" className="gg-btn-ghost" disabled={selectorPage >= totalPages - 1}
                        onClick={() => setSelectorPage((p) => p + 1)} style={{ fontSize: 12, padding: "5px 10px" }}>Next →</button>
                    </div>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 13, color: "rgb(var(--text-300))" }}>{selectedIds.size.toLocaleString()} selected</span>
                  <button type="button" className="gg-btn-success" onClick={confirmSelection}
                    disabled={selectedIds.size === 0} style={{ fontSize: 14, padding: "10px 24px" }}>
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

// Fields that live on the households table — used to split saved filters on load
const HH_FIELDS = new Set([
  "total_persons", "adults_count", "children_count", "generations_count",
  "household_voter_count", "household_parties", "head_of_household",
  "household_gender", "has_senior", "has_young_adult", "has_children",
  "is_single_parent", "has_disabled", "home_owner", "home_estimated_value",
  "home_purchase_year", "home_dwelling_type", "home_sqft", "home_bedrooms",
]);
