"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminIdentity = {
  userId: string; email: string; isSuperAdmin: boolean;
  tenantId: string | null; role: string | null;
};
type EntityType = "people" | "households" | "locations" | "companies";
type FilterOp =
  | "contains" | "equals" | "starts_with" | "not_contains"
  | "is_empty" | "not_empty" | "greater_than" | "gte" | "less_than" | "lte"
  | "is_true" | "is_false" | "in_list" | "not_in_list";
type FilterRow = { id: number; field: string; op: FilterOp; value: string; data_type: string };
type SchemaCol  = { column: string; label: string; data_type: string; is_join: boolean };
type ContactType = { key: string; label: string; stages: { key: string; label: string }[] };
type FieldDef   = {
  key: string; label: string;
  inputType: "text" | "select" | "multiselect" | "textarea";
  options?: { value: string; label: string }[];
  hasMode?: boolean;
};
type FieldEdit  = { enabled: boolean; value: any; mode: "replace" | "append" };

// ── Entity column display ─────────────────────────────────────────────────────

const ENTITY_TABS: { value: EntityType; label: string }[] = [
  { value: "people",     label: "People" },
  { value: "households", label: "Households" },
  { value: "locations",  label: "Locations" },
  { value: "companies",  label: "Companies" },
];

const ENTITY_COLUMNS: Record<EntityType, { key: string; label: string; width?: number }[]> = {
  people:     [
    { key: "name", label: "Name", width: 200 }, { key: "email", label: "Email", width: 220 },
    { key: "phone", label: "Phone", width: 140 }, { key: "contact_type", label: "Contact Type", width: 130 },
  ],
  households: [{ key: "name", label: "Name", width: 220 }, { key: "address", label: "Address", width: 380 }],
  locations:  [{ key: "address", label: "Address", width: 320 }, { key: "city", label: "City", width: 140 }, { key: "state", label: "State", width: 80 }],
  companies:  [{ key: "name", label: "Name", width: 220 }, { key: "industry", label: "Industry", width: 160 }, { key: "status", label: "Status", width: 120 }],
};

const SEARCH_ENDPOINTS: Record<EntityType, string> = {
  people: "/api/crm/people/search", households: "/api/crm/households/search",
  locations: "/api/crm/locations/search", companies: "/api/crm/companies/search",
};

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

// ── Editable field definitions ────────────────────────────────────────────────
// Mirrors EDITABLE_FIELDS in mutations.ts — ALL fields, not just a few.

function getEditFields(target: EntityType, contactTypes: ContactType[]): FieldDef[] {
  const ctOpts = [{ value: "", label: "— none —" }, ...contactTypes.map((ct) => ({ value: ct.key, label: ct.label }))];
  const stateOpts = [{ value: "", label: "— select —" }, ...US_STATES.map((s) => ({ value: s, label: s }))];

  switch (target) {
    case "people":
      return [
        // ── Identity
        { key: "title",          label: "Title",          inputType: "text" },
        { key: "first_name",     label: "First Name",     inputType: "text" },
        { key: "middle_name",    label: "Middle Name",    inputType: "text" },
        { key: "middle_initial", label: "Middle Initial", inputType: "text" },
        { key: "last_name",      label: "Last Name",      inputType: "text" },
        { key: "suffix",         label: "Suffix",         inputType: "text" },
        // ── Contact info
        { key: "email",          label: "Email",          inputType: "text" },
        { key: "phone",          label: "Phone",          inputType: "text" },
        { key: "phone_cell",     label: "Cell Phone",     inputType: "text" },
        { key: "phone_landline", label: "Landline",       inputType: "text" },
        // ── Contact types
        { key: "contact_types",  label: "Contact Types (multi-value)", inputType: "multiselect", options: contactTypes.map((ct) => ({ value: ct.key, label: ct.label })) },
        { key: "contact_type",   label: "Contact Type (legacy single)", inputType: "select", options: ctOpts },
        // ── Notes
        { key: "notes", label: "Notes", inputType: "textarea", hasMode: true },
      ];
    case "households":
      return [
        { key: "name",  label: "Name",  inputType: "text" },
        { key: "notes", label: "Notes", inputType: "textarea", hasMode: true },
      ];
    case "locations":
      return [
        { key: "address_line1", label: "Street Address", inputType: "text" },
        { key: "address_line2", label: "Address Line 2", inputType: "text" },
        { key: "city",          label: "City",           inputType: "text" },
        { key: "state",         label: "State",          inputType: "select", options: stateOpts },
        { key: "postal_code",   label: "Zip Code",       inputType: "text" },
        { key: "notes",         label: "Notes",          inputType: "textarea", hasMode: true },
      ];
    case "companies":
      return [
        { key: "name",     label: "Name",     inputType: "text" },
        { key: "domain",   label: "Domain",   inputType: "text" },
        { key: "phone",    label: "Phone",    inputType: "text" },
        { key: "email",    label: "Email",    inputType: "text" },
        { key: "industry", label: "Industry", inputType: "text" },
        { key: "presence", label: "Presence", inputType: "text" },
        { key: "status",   label: "Status",   inputType: "select", options: [
          { value: "", label: "— none —" },
          { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "prospect", label: "Prospect" },
        ]},
        { key: "notes", label: "Notes", inputType: "textarea", hasMode: true },
      ];
  }
}

// ── Filter operator config ────────────────────────────────────────────────────

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "contains" }, { value: "equals", label: "equals" },
  { value: "in_list", label: "is any of" }, { value: "not_in_list", label: "is none of" },
  { value: "starts_with", label: "starts with" }, { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty" }, { value: "not_empty", label: "is not empty" },
];
const NUM_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals", label: "=" }, { value: "greater_than", label: ">" }, { value: "gte", label: "≥" },
  { value: "less_than", label: "<" }, { value: "lte", label: "≤" },
  { value: "is_empty", label: "is empty" }, { value: "not_empty", label: "is not empty" },
];
const BOOL_OPS: { value: FilterOp; label: string }[] = [
  { value: "is_true", label: "is true" }, { value: "is_false", label: "is false" },
];
const NUMERIC_TYPES = new Set([
  "integer","int","int2","int4","int8","bigint","smallint","numeric","decimal","real","float4","float8","double precision",
]);
function opsForType(type: string) {
  if (type === "boolean") return BOOL_OPS;
  if (NUMERIC_TYPES.has(type)) return NUM_OPS;
  return TEXT_OPS;
}
function defaultOp(type: string): FilterOp {
  if (type === "boolean") return "is_true";
  if (NUMERIC_TYPES.has(type)) return "equals";
  return "contains";
}

// ── Row normalizer ────────────────────────────────────────────────────────────

function normalizeRow(target: EntityType, item: any): Record<string, any> {
  switch (target) {
    case "people":
      return {
        id: item.id,
        name: item.name ?? ([item.first_name, item.last_name].filter(Boolean).join(" ") || "—"),
        email: item.email ?? "", phone: item.phone ?? "", contact_type: item.contact_type ?? "",
      };
    case "households":
      return {
        id: item.id, name: item.name ?? "(unnamed)",
        address: [item.address ?? item.address_line1, item.city, item.state, item.postal_code].filter(Boolean).join(", "),
      };
    case "locations":
      return { id: item.id, address: item.address ?? item.address_line1 ?? "", city: item.city ?? "", state: item.state ?? "" };
    case "companies":
      return { id: item.id, name: item.name ?? "(Unnamed)", industry: item.industry ?? "", status: item.status ?? "" };
  }
}

// ── Indeterminate checkbox ────────────────────────────────────────────────────

function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input type="checkbox" ref={ref} checked={checked} onChange={onChange} />;
}

// ── Shared styles (theme-safe) ────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "6px 10px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 5,
  fontSize: 14, background: "var(--gg-bg, #fff)", color: "var(--gg-text, #111)",
  width: "100%", maxWidth: 320, boxSizing: "border-box",
};
const selectStyle: React.CSSProperties = {
  padding: "6px 10px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 5,
  fontSize: 14, background: "var(--gg-bg, #fff)", color: "var(--gg-text, #111)", cursor: "pointer",
};
// Ghost button — inherits text color from theme, readable on any bg
const ghostBtn: React.CSSProperties = {
  padding: "6px 14px", fontSize: 13, borderRadius: 5,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-bg, #fff)", color: "var(--gg-text, #374151)", cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  padding: "6px 18px", fontSize: 13, fontWeight: 600, borderRadius: 5,
  border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer",
};

let _filterId = 0;
const freshRow = (): FilterRow => ({ id: ++_filterId, field: "", op: "contains", value: "", data_type: "text" });

// ── Main component ────────────────────────────────────────────────────────────

export default function BulkEditPanel() {
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identity, setIdentity]               = useState<AdminIdentity | null>(null);
  const [target, setTarget]                   = useState<EntityType>("people");
  const [mode, setMode]                       = useState<"search" | "filter">("search");

  const [query, setQuery]                   = useState("");
  const [searchResults, setSearchResults]   = useState<Record<string, any>[]>([]);
  const [searchTotal, setSearchTotal]       = useState(0);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [schema, setSchema]                   = useState<SchemaCol[]>([]);
  const [filterRows, setFilterRows]           = useState<FilterRow[]>([freshRow()]);
  const [filterLoading, setFilterLoading]     = useState(false);
  const [filterSearched, setFilterSearched]   = useState(false);
  const [filterResults, setFilterResults]     = useState<Record<string, any>[]>([]);

  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [contactTypes, setContactTypes] = useState<ContactType[]>([]);
  const [fieldEdits, setFieldEdits]     = useState<Record<string, FieldEdit>>({});
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [applying, setApplying]         = useState(false);
  const [applyResult, setApplyResult]   = useState<{ updated: number; errors?: string[] } | null>(null);
  const [page, setPage]                 = useState(0);
  const perPage = 100;

  // ── Admin check ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) { setIdentityLoading(false); return; }
      fetch("/api/crm/admin/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((id: AdminIdentity | null) => setIdentity(id))
        .catch(() => setIdentity(null))
        .finally(() => setIdentityLoading(false));
    });
  }, []);

  useEffect(() => {
    fetch("/api/crm/settings/contact-types")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setContactTypes(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // ── Reset on tab change ───────────────────────────────────────────────────
  useEffect(() => {
    setQuery(""); setSearchResults([]); setSearchTotal(0); setSearchSearched(false);
    setFilterRows([freshRow()]); setFilterResults([]); setFilterSearched(false);
    setSchema([]); setSelected(new Set()); setFieldEdits({});
    setConfirmOpen(false); setApplyResult(null); setPage(0);
  }, [target]);

  // ── Schema for filter mode ────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "filter" || schema.length > 0) return;
    fetch(`/api/crm/schema?table=${target}`)
      .then((r) => r.json())
      .then((cols: SchemaCol[]) => {
        setSchema(cols);
        if (cols.length > 0) {
          setFilterRows([{ id: ++_filterId, field: cols[0].column, op: defaultOp(cols[0].data_type), value: "", data_type: cols[0].data_type }]);
        }
      }).catch(() => {});
  }, [mode, target, schema.length]);

  // ── Quick search ──────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    setSearchLoading(true); setSearchSearched(true);
    try {
      const res  = await fetch(`${SEARCH_ENDPOINTS[target]}?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      const raw  = json.rows ?? (Array.isArray(json) ? json : []);
      setSearchResults(raw.map((item: any) => normalizeRow(target, item)));
      setSearchTotal(json.total ?? raw.length);
    } catch { setSearchResults([]); setSearchTotal(0); }
    finally { setSearchLoading(false); }
  }, [target]);

  useEffect(() => {
    if (mode !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mode, query, doSearch]);

  // ── Filter run ────────────────────────────────────────────────────────────
  async function runFilter() {
    setFilterLoading(true); setFilterSearched(true); setSelected(new Set()); setPage(0);
    try {
      const res  = await fetch("/api/crm/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, filters: filterRows.filter((r) => r.field).map((r) => ({ field: r.field, op: r.op, value: r.value, data_type: r.data_type })) }),
      });
      const data = await res.json();
      setFilterResults((Array.isArray(data) ? data : []).map((item: any) => normalizeRow(target, item)));
    } catch { setFilterResults([]); }
    finally { setFilterLoading(false); }
  }

  function getSchemaCol(f: string) { return schema.find((c) => c.column === f); }
  function addFilterRow() {
    const first = schema[0];
    setFilterRows((p) => [...p, { id: ++_filterId, field: first?.column ?? "", op: defaultOp(first?.data_type ?? "text"), value: "", data_type: first?.data_type ?? "text" }]);
  }
  function removeFilterRow(id: number) { setFilterRows((p) => p.filter((r) => r.id !== id)); }
  function updateFilterRow(id: number, patch: Partial<FilterRow>) {
    setFilterRows((p) => p.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      if (patch.field && patch.field !== r.field) {
        const col = getSchemaCol(patch.field);
        next.op = defaultOp(col?.data_type ?? "text"); next.value = ""; next.data_type = col?.data_type ?? "text";
      }
      return next;
    }));
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  const currentResults = mode === "search" ? searchResults : filterResults;
  const pageRows       = currentResults.slice(page * perPage, (page + 1) * perPage);
  function toggleRow(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const selectAll   = () => setSelected(new Set(currentResults.map((r) => r.id)));
  const deselectAll = () => setSelected(new Set());

  // ── Field edit helpers ────────────────────────────────────────────────────
  function getEdit(key: string, inputType: string): FieldEdit {
    return fieldEdits[key] ?? { enabled: false, value: inputType === "multiselect" ? [] : "", mode: "replace" };
  }
  function setEnabled(key: string, enabled: boolean, inputType: string) {
    setFieldEdits((p) => ({ ...p, [key]: { ...(p[key] ?? { value: inputType === "multiselect" ? [] : "", mode: "replace" as const }), enabled } }));
  }
  function setValue(key: string, value: any, inputType: string) {
    setFieldEdits((p) => ({ ...p, [key]: { ...(p[key] ?? { enabled: false, mode: "replace" as const, value: inputType === "multiselect" ? [] : "" }), value } }));
  }
  function setMode2(key: string, m: "replace" | "append") {
    setFieldEdits((p) => ({ ...p, [key]: { ...(p[key] ?? { enabled: false, value: "" }), mode: m } }));
  }
  function toggleChip(key: string, v: string) {
    const cur = (fieldEdits[key]?.value ?? []) as string[];
    setValue(key, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v], "multiselect");
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  async function applyEdits() {
    setApplying(true); setConfirmOpen(false); setApplyResult(null);
    const updates: Record<string, any> = {};
    for (const fd of editFields) {
      const edit = fieldEdits[fd.key];
      if (!edit?.enabled) continue;
      updates[fd.key] = edit.value;
      if (fd.hasMode) updates.notes_mode = edit.mode ?? "replace";
    }
    if (!Object.keys(updates).length) { setApplying(false); return; }
    try {
      const res  = await fetch("/api/crm/bulk-edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ids: [...selected], updates }),
      });
      const data = await res.json();
      setApplyResult({ updated: data.updated ?? 0, errors: data.errors });
      setSelected(new Set()); setFieldEdits({});
    } catch (err: any) {
      setApplyResult({ updated: 0, errors: [err.message ?? "Request failed"] });
    } finally { setApplying(false); }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (identityLoading) {
    return <div style={{ padding: 32, color: "var(--gg-text-dim, #6b7280)" }}>Loading…</div>;
  }
  const isAdmin = identity?.isSuperAdmin || identity?.role === "admin";
  if (!identity || !isAdmin) {
    return (
      <section className="stack" style={{ maxWidth: 480 }}>
        <h1 style={{ margin: 0 }}>Bulk Edit</h1>
        <div style={{ padding: 24, border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, background: "var(--gg-bg-subtle, #f9fafb)" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--gg-text, #111)" }}>Admin access required</p>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>This page requires admin permissions.</p>
        </div>
      </section>
    );
  }

  const editFields    = getEditFields(target, contactTypes);
  const hasValidEdits = editFields.some((f) => fieldEdits[f.key]?.enabled);
  const hasSearched   = mode === "search" ? searchSearched : filterSearched;

  return (
    <section className="stack">
      <div>
        <h1 style={{ margin: 0 }}>Bulk Edit</h1>
        <p className="text-dim" style={{ marginTop: 4 }}>
          Filter records, select them, then apply field updates to all selected at once.
        </p>
      </div>

      {applyResult && (
        <div style={{
          padding: "12px 16px", borderRadius: 8, fontSize: 14,
          border: `1px solid ${applyResult.errors?.length ? "#fca5a5" : "#86efac"}`,
          background: applyResult.errors?.length ? "#fef2f2" : "#f0fdf4",
          color: applyResult.errors?.length ? "#991b1b" : "#166534",
        }}>
          {applyResult.errors?.length
            ? `Updated ${applyResult.updated} records with errors: ${applyResult.errors.join("; ")}`
            : `Successfully updated ${applyResult.updated} records.`}
        </div>
      )}

      {/* Entity tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--gg-border, #e5e7eb)" }}>
        {ENTITY_TABS.map((tab) => (
          <button key={tab.value} onClick={() => setTarget(tab.value)} style={{
            padding: "9px 18px", fontSize: 14, fontWeight: target === tab.value ? 600 : 400,
            background: "none", border: "none",
            borderBottom: target === tab.value ? "2px solid var(--gg-primary, #2563eb)" : "2px solid transparent",
            color: target === tab.value ? "var(--gg-primary, #2563eb)" : "var(--gg-text, #374151)",
            cursor: "pointer", marginBottom: -1,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
        {(["search", "filter"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "7px 16px", fontSize: 13, fontWeight: mode === m ? 600 : 400,
            background: mode === m ? "var(--gg-primary, #2563eb)" : "var(--gg-bg, #fff)",
            color: mode === m ? "#fff" : "var(--gg-text, #374151)",
            border: "none", cursor: "pointer",
          }}>
            {m === "search" ? "Quick Search" : "Filters"}
          </button>
        ))}
      </div>

      {/* Quick search */}
      {mode === "search" && (
        <div>
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${target}…`}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, fontSize: 14, background: "var(--gg-bg, #fff)", color: "var(--gg-text, #111)", outline: "none" }}
          />
          {searchLoading && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>Searching…</p>}
        </div>
      )}

      {/* Filter mode */}
      {mode === "filter" && (
        <div style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, padding: 16, background: "var(--gg-bg-subtle, #f9fafb)", display: "flex", flexDirection: "column", gap: 10 }}>
          {filterRows.map((row, i) => {
            const col     = getSchemaCol(row.field);
            const ops     = opsForType(col?.data_type ?? "text");
            const hideVal = ["is_empty","not_empty","is_true","is_false"].includes(row.op);
            return (
              <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gg-text-dim, #6b7280)", minWidth: 40, textAlign: "right" }}>
                  {i === 0 ? "WHERE" : "AND"}
                </span>
                <select value={row.field} onChange={(e) => updateFilterRow(row.id, { field: e.target.value })} style={selectStyle}>
                  {schema.length === 0 && <option value="">Loading…</option>}
                  {schema.map((c) => <option key={c.column} value={c.column}>{c.label}</option>)}
                </select>
                <select value={row.op} onChange={(e) => updateFilterRow(row.id, { op: e.target.value as FilterOp })} style={selectStyle}>
                  {ops.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
                {!hideVal && (
                  <input value={row.value} onChange={(e) => updateFilterRow(row.id, { value: e.target.value })} placeholder="value…"
                    style={{ padding: "6px 10px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 5, fontSize: 14, background: "var(--gg-bg, #fff)", color: "var(--gg-text, #111)", minWidth: 160 }}
                  />
                )}
                {filterRows.length > 1 && (
                  <button onClick={() => removeFilterRow(row.id)}
                    style={{ padding: "4px 8px", fontSize: 13, border: "none", background: "none", color: "var(--gg-text-dim, #9ca3af)", cursor: "pointer" }}>×</button>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={addFilterRow} style={ghostBtn}>+ Add Filter</button>
            <button onClick={runFilter} disabled={filterLoading || filterRows.every((r) => !r.field)}
              style={{ ...primaryBtn, opacity: filterLoading ? 0.7 : 1, cursor: filterLoading ? "default" : "pointer" }}>
              {filterLoading ? "Filtering…" : "Run Filter"}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && (
        <>
          {currentResults.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer", color: "var(--gg-text, #374151)" }}>
                <IndeterminateCheckbox
                  checked={selected.size > 0 && selected.size === currentResults.length}
                  indeterminate={selected.size > 0 && selected.size < currentResults.length}
                  onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                />
                Select all ({currentResults.length})
              </label>
              {selected.size > 0 && (
                <button onClick={deselectAll}
                  style={{ ...ghostBtn, padding: "3px 10px", fontSize: 12 }}>
                  Deselect all
                </button>
              )}
              {selected.size > 0 && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gg-primary, #2563eb)" }}>
                  {selected.size} selected
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
                {currentResults.length} record{currentResults.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {currentResults.length === 0 ? (
            <div style={{ border: "1px dashed var(--gg-border, #e5e7eb)", borderRadius: 8, padding: "48px 24px", textAlign: "center", color: "var(--gg-text-dim, #9ca3af)" }}>
              No records found.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--gg-border, #e5e7eb)" }}>
                    <th style={{ width: 40, padding: "8px 12px" }}></th>
                    {ENTITY_COLUMNS[target].map((col) => (
                      <th key={col.key} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--gg-text-dim, #6b7280)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", width: col.width }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} onClick={() => toggleRow(row.id)} style={{
                      borderBottom: "1px solid var(--gg-border, #f3f4f6)",
                      // Use rgba so it overlays correctly on both light and dark themes
                      background: selected.has(row.id) ? "rgba(37,99,235,0.12)" : undefined,
                      cursor: "pointer",
                    }}>
                      <td style={{ padding: "8px 12px" }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                      </td>
                      {ENTITY_COLUMNS[target].map((col) => (
                        <td key={col.key} style={{ padding: "9px 12px", maxWidth: col.width ?? 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--gg-text, #111)" }}>
                          {row[col.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {currentResults.length > perPage && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
                {page * perPage + 1}–{Math.min((page + 1) * perPage, currentResults.length)} of {currentResults.length}
              </span>
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? "default" : "pointer" }}>‹ Prev</button>
              <button disabled={(page + 1) * perPage >= currentResults.length} onClick={() => setPage((p) => p + 1)}
                style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, opacity: (page + 1) * perPage >= currentResults.length ? 0.4 : 1, cursor: (page + 1) * perPage >= currentResults.length ? "default" : "pointer" }}>Next ›</button>
            </div>
          )}
        </>
      )}

      {/* Bulk Edit Panel */}
      {selected.size > 0 && (
        <div style={{ border: "2px solid var(--gg-primary, #2563eb)", borderRadius: 8, padding: "20px 24px", background: "var(--gg-bg, #fff)" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "var(--gg-text, #111)" }}>
            {selected.size} {target} record{selected.size !== 1 ? "s" : ""} selected
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
            Check the fields you want to change, set their new values, then apply.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px 24px" }}>
            {editFields.map((fd) => {
              const edit   = getEdit(fd.key, fd.inputType);
              return (
                <div key={fd.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={edit.enabled} onChange={(e) => setEnabled(fd.key, e.target.checked, fd.inputType)} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--gg-text, #111)" }}>{fd.label}</span>
                  </label>

                  {edit.enabled && (
                    <div style={{ marginLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
                      {fd.hasMode && (
                        <div style={{ display: "flex", gap: 14 }}>
                          {(["replace","append"] as const).map((m) => (
                            <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", color: "var(--gg-text, #374151)" }}>
                              <input type="radio" name={`mode_${fd.key}`} value={m} checked={(edit.mode ?? "replace") === m} onChange={() => setMode2(fd.key, m)} />
                              {m === "replace" ? "Replace" : "Append"}
                            </label>
                          ))}
                        </div>
                      )}

                      {fd.inputType === "multiselect" && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {(fd.options ?? []).length === 0 && (
                            <span style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>No contact types configured.</span>
                          )}
                          {(fd.options ?? []).map((opt) => {
                            const on = ((edit.value ?? []) as string[]).includes(opt.value);
                            return (
                              <button key={opt.value} onClick={() => toggleChip(fd.key, opt.value)} style={{
                                padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: on ? 600 : 400,
                                border: "1px solid", cursor: "pointer",
                                borderColor: on ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)",
                                background: on ? "var(--gg-primary, #2563eb)" : "transparent",
                                color: on ? "#fff" : "var(--gg-text, #374151)",
                              }}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {fd.inputType === "select" && (
                        <select value={edit.value ?? ""} onChange={(e) => setValue(fd.key, e.target.value, fd.inputType)}
                          style={{ ...selectStyle, maxWidth: 260 }}>
                          {(fd.options ?? []).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      )}

                      {fd.inputType === "text" && (
                        <input type="text" value={edit.value ?? ""} onChange={(e) => setValue(fd.key, e.target.value, fd.inputType)}
                          style={inputStyle} />
                      )}

                      {fd.inputType === "textarea" && (
                        <textarea value={edit.value ?? ""} onChange={(e) => setValue(fd.key, e.target.value, fd.inputType)}
                          rows={3} placeholder={edit.mode === "append" ? "Text to append…" : "New value…"}
                          style={{ ...inputStyle, maxWidth: 280, resize: "vertical", fontFamily: "inherit" }} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {!confirmOpen ? (
              <button disabled={!hasValidEdits || applying} onClick={() => setConfirmOpen(true)}
                style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, border: "none", borderRadius: 6,
                  background: hasValidEdits ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)",
                  color: hasValidEdits ? "#fff" : "var(--gg-text-dim, #9ca3af)",
                  cursor: hasValidEdits ? "pointer" : "default" }}>
                Apply to {selected.size} record{selected.size !== 1 ? "s" : ""}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#92400e" }}>
                  Update {selected.size} {target}?
                </span>
                <button onClick={applyEdits} disabled={applying}
                  style={{ padding: "7px 18px", fontSize: 14, fontWeight: 600, border: "none", borderRadius: 6, background: "#dc2626", color: "#fff", cursor: applying ? "default" : "pointer", opacity: applying ? 0.7 : 1 }}>
                  {applying ? "Applying…" : "Yes, update"}
                </button>
                <button onClick={() => setConfirmOpen(false)} style={ghostBtn}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
