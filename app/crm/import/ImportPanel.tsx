"use client";

import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { L2_FIELD_MAP } from "@/lib/crm/l2-field-map";

// ── Types ──────────────────────────────────────────────────────────────────

type TargetField =
  // Core
  | "first_name" | "last_name" | "email" | "phone"
  | "contact_type" | "occupation" | "notes"
  | "address_line1" | "city" | "state" | "postal_code"
  // People: L2 voter identity
  | "lalvoteid" | "state_voter_id" | "county_voter_id"
  | "gender" | "birth_date" | "age" | "party" | "party_switcher"
  | "voter_status" | "registration_date" | "permanent_absentee"
  | "veteran" | "do_not_call" | "place_of_birth"
  | "phone_cell" | "phone_landline" | "mailing_address"
  // People: L2 political scores
  | "score_prog_dem" | "score_mod_dem" | "score_cons_rep" | "score_mod_rep"
  // People: L2 voting history
  | "voting_frequency" | "early_voter" | "absentee_type"
  // People: L2 demographics
  | "ethnicity" | "ethnicity_source" | "hispanic_origin" | "language"
  | "english_proficiency" | "education_level" | "marital_status" | "religion"
  // People: L2 professional / financial / mover
  | "occupation_title" | "company_name" | "income_range" | "net_worth_range"
  | "length_of_residence" | "moved_from_state"
  // Households: L2
  | "total_persons" | "adults_count" | "children_count" | "generations_count"
  | "has_senior" | "has_young_adult" | "has_children" | "is_single_parent"
  | "has_disabled" | "household_voter_count" | "household_parties"
  | "head_of_household" | "household_gender" | "home_owner"
  | "home_estimated_value" | "home_purchase_year" | "home_dwelling_type"
  | "home_sqft" | "home_bedrooms"
  // Locations: L2 districts + geo
  | "congressional_district" | "state_house_district" | "state_senate_district"
  | "state_legislative_district" | "county_name" | "fips_code" | "precinct"
  | "municipality" | "municipal_subdistrict" | "county_commission_district"
  | "county_supervisor_district" | "school_district" | "college_district"
  | "judicial_district" | "time_zone" | "urbanicity" | "population_density"
  | "census_tract" | "census_block_group" | "census_block" | "dma"
  | "__skip__" | "__create__";

const TARGET_FIELDS: { value: TargetField; label: string }[] = [
  { value: "__skip__",    label: "— skip —" },
  { value: "__create__",  label: "→ Create field (use column name)" },
  { value: "first_name",  label: "First Name" },
  { value: "last_name",   label: "Last Name" },
  { value: "email",       label: "Email" },
  { value: "phone",       label: "Phone" },
  { value: "contact_type",label: "Contact Type" },
  { value: "occupation",  label: "Occupation" },
  { value: "notes",       label: "Notes" },
  { value: "address_line1",label: "Street Address" },
  { value: "city",        label: "City" },
  { value: "state",       label: "State" },
  { value: "postal_code", label: "Zip Code" },
];

// Auto-detect common column name → target field
const AUTO_MAP: Record<string, TargetField> = {
  first_name: "first_name", fname: "first_name", first: "first_name", firstname: "first_name",
  last_name: "last_name", lname: "last_name", last: "last_name", lastname: "last_name", surname: "last_name",
  email: "email", email_address: "email", emailaddress: "email",
  phone: "phone", phone_number: "phone", phonenumber: "phone", cell: "phone", mobile: "phone", telephone: "phone",
  address: "address_line1", street: "address_line1", street_address: "address_line1",
  address1: "address_line1", addr: "address_line1", address_line1: "address_line1",
  city: "city",
  state: "state", st: "state",
  zip: "postal_code", zipcode: "postal_code", zip_code: "postal_code",
  postal_code: "postal_code", zip5: "postal_code", postalcode: "postal_code",
  contact_type: "contact_type", type: "contact_type", party: "contact_type",
  party_affiliation: "contact_type", partyaffiliation: "contact_type",
  occupation: "occupation", job: "occupation", employer_name: "occupation",
  notes: "notes", comments: "notes", note: "notes",
};

function autoDetect(col: string): TargetField {
  const key = col.trim().toLowerCase().replace(/[\s-]/g, "_");
  // Check L2 map first
  const l2 = L2_FIELD_MAP[key];
  if (l2) {
    if (l2.dest === "meta") return "__create__";
    return l2.column as TargetField;
  }
  return AUTO_MAP[key] ?? "__skip__";
}

type ParsedData = {
  headers: string[];
  rows: Record<string, string>[];
};

type Step = "upload" | "map" | "preview" | "validate" | "done";

type ImportResult = {
  dryRun?: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
};

// ── Parser helpers ─────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<ParsedData> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".json")) {
    const text = await file.text();
    const data = JSON.parse(text);
    const arr: Record<string, any>[] = Array.isArray(data) ? data : [data];
    const headers = arr.length > 0 ? Object.keys(arr[0]) : [];
    const rows = arr.map((r) => {
      const out: Record<string, string> = {};
      for (const h of headers) out[h] = String(r[h] ?? "");
      return out;
    });
    return { headers, rows };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const xlsx = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = xlsx.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: Record<string, any>[] = xlsx.utils.sheet_to_json(ws, { defval: "" });
    const headers = raw.length > 0 ? Object.keys(raw[0]) : [];
    const rows = raw.map((r) => {
      const out: Record<string, string> = {};
      for (const h of headers) out[h] = String(r[h] ?? "");
      return out;
    });
    return { headers, rows };
  }

  // CSV / TSV — use papaparse
  const Papa = await import("papaparse");
  return new Promise((resolve, reject) => {
    Papa.default.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        resolve({ headers, rows: results.data as Record<string, string>[] });
      },
      error: reject,
    });
  });
}

// ── Main component ─────────────────────────────────────────────────────────

// Schema field from /api/crm/schema
type SchemaField = { column: string; label: string; data_type: string; is_join: boolean };

// Address fields that route to the locations table
const LOCATION_FIELD_COLS = new Set(["address_line1", "city", "state", "postal_code"]);

export default function ImportPanel() {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<Record<string, TargetField>>({});
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validateResult, setValidateResult] = useState<ImportResult | null>(null);
  const [parseErr, setParseErr] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Get session token
  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  // Load admin identity + tenants on step change to preview
  async function loadAdminInfo() {
    const token = await getToken();
    if (!token) return;
    const meRes = await fetch("/api/crm/admin/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = await meRes.json();
    if (me.isSuperAdmin) {
      setIsSuperAdmin(true);
      const tRes = await fetch("/api/crm/admin/tenants", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tData = await tRes.json();
      const list = Array.isArray(tData) ? tData : [];
      setTenants(list);
      if (list.length > 0) setSelectedTenant(list[0].id);
    }
  }

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setParseErr("");
    try {
      const [data, schemaRes] = await Promise.all([
        parseFile(file),
        fetch("/api/crm/schema?table=people").then((r) => r.json()).catch(() => []),
      ]);
      if (data.rows.length === 0) {
        setParseErr("No rows found in file.");
        return;
      }
      // Merge people schema + location join fields (deduped)
      const schema: SchemaField[] = Array.isArray(schemaRes) ? schemaRes : [];
      setSchemaFields(schema);

      const autoMapping: Record<string, TargetField> = {};
      for (const h of data.headers) autoMapping[h] = autoDetect(h);
      setParsed(data);
      setMapping(autoMapping);
      setStep("map");
    } catch (e: any) {
      setParseErr(`Failed to parse file: ${e?.message ?? e}`);
    }
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // ── Proceed from mapping to preview ────────────────────────────────────────

  async function goToPreview() {
    await loadAdminInfo();
    setStep("preview");
  }

  // ── Build mapped rows from parsed data ────────────────────────────────────

  function buildMappedRows() {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: Record<string, any> = {};
      const meta: Record<string, string> = {};
      for (const [col, target] of Object.entries(mapping)) {
        const val = (row[col] ?? "").trim();
        if (!val) continue;
        if (target === "__create__") {
          meta[col] = val;
        } else if (target !== "__skip__") {
          out[target] = val;
        }
      }
      if (Object.keys(meta).length > 0) out.__meta = meta;
      return out;
    });
  }

  // ── Validate (dry run) ─────────────────────────────────────────────────────

  async function runValidate() {
    if (!parsed) return;
    setImporting(true);
    setValidateResult(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = { rows: buildMappedRows(), dryRun: true };
      if (isSuperAdmin && selectedTenant) body.tenant_id = selectedTenant;

      const res = await fetch("/api/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      setValidateResult(data);
      setStep("validate");
    } catch (e: any) {
      setValidateResult({ inserted: 0, updated: 0, skipped: 0, failed: 1, errors: [(e as Error).message] });
      setStep("validate");
    } finally {
      setImporting(false);
    }
  }

  // ── Real import ────────────────────────────────────────────────────────────

  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    setResult(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = { rows: buildMappedRows(), dryRun: false };
      if (isSuperAdmin && selectedTenant) body.tenant_id = selectedTenant;

      const res = await fetch("/api/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      setStep("done");
    } catch (e: any) {
      setResult({ inserted: 0, updated: 0, skipped: 0, failed: 1, errors: [(e as Error).message] });
      setStep("done");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep("upload");
    setParsed(null);
    setMapping({});
    setResult(null);
    setValidateResult(null);
    setParseErr("");
    setIsSuperAdmin(false);
    setTenants([]);
    setSelectedTenant("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Check mapping validity ──────────────────────────────────────────────────

  const mappedTargets = Object.values(mapping);
  const hasName = mappedTargets.includes("first_name") || mappedTargets.includes("last_name");

  // Preview rows (first 5, with mapping applied)
  const previewRows = (parsed?.rows ?? []).slice(0, 5).map((row) => {
    const out: Record<string, string> = {};
    for (const [col, target] of Object.entries(mapping)) {
      if (target === "__create__") out[`__custom__${col}`] = (row[col] ?? "").trim();
      else if (target !== "__skip__") out[target] = (row[col] ?? "").trim();
    }
    return out;
  });

  // Build preview column list: schema-known fields + custom "create" columns
  const allFieldOptions = schemaFields.length > 0
    ? schemaFields.map((f) => ({ value: f.column, label: f.label }))
    : TARGET_FIELDS.filter((f) => f.value !== "__skip__" && f.value !== "__create__");

  const mappedFields = [
    ...allFieldOptions.filter((f) => mappedTargets.includes(f.value)),
    ...Object.entries(mapping)
      .filter(([, t]) => t === "__create__")
      .map(([col]) => ({ value: `__custom__${col}`, label: `${col} (custom)` })),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="stack">
      <h1 style={{ margin: 0 }}>Import Data</h1>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <>
          <p style={{ margin: 0, color: "var(--gg-text-dim, #6b7280)", fontSize: 14 }}>
            Upload a CSV, Excel, TSV, or JSON file. You&rsquo;ll map columns to fields before importing.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #d1d5db)"}`,
              borderRadius: 10,
              padding: "60px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "rgba(37,99,235,0.04)" : "var(--gg-bg-subtle, #f9fafb)",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 15 }}>
              Drop a file here or click to browse
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>
              Supports .csv, .tsv, .xlsx, .xls, .json
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json"
            style={{ display: "none" }}
            onChange={onFileChange}
          />
          {parseErr && (
            <p style={{ margin: 0, color: "#ef4444", fontSize: 14 }}>{parseErr}</p>
          )}
        </>
      )}

      {/* ── Step 2: Column Mapping ── */}
      {step === "map" && parsed && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>
              Detected <strong>{parsed.rows.length.toLocaleString()}</strong> rows with <strong>{parsed.headers.length}</strong> columns.
              Map each column to the correct field (or skip it).
            </p>
            <button onClick={reset} style={ghostBtn}>← Start over</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--gg-border, #e5e7eb)" }}>
                  <th style={th}>File Column</th>
                  <th style={th}>Map To</th>
                  <th style={th}>Sample Values</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((col) => (
                  <tr key={col} style={{ borderBottom: "1px solid var(--gg-border, #f3f4f6)" }}>
                    <td style={td}>
                      <code style={{ fontSize: 12, background: "#e5e7eb", color: "#111827", padding: "2px 6px", borderRadius: 4 }}>
                        {col}
                      </code>
                    </td>
                    <td style={td}>
                      <select
                        value={mapping[col] ?? "__skip__"}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [col]: e.target.value as TargetField }))
                        }
                        style={{
                          padding: "5px 8px",
                          border: "1px solid var(--gg-border, #e5e7eb)",
                          borderRadius: 5,
                          fontSize: 13,
                          background: mapping[col] && mapping[col] !== "__skip__"
                            ? "rgba(37,99,235,0.06)"
                            : "var(--gg-bg, #fff)",
                        }}
                      >
                        {/* Always-present options */}
                        <option value="__skip__">— skip —</option>
                        <option value="__create__">→ Create field (use column name)</option>

                        {schemaFields.length > 0 ? (
                          <>
                            <optgroup label="People">
                              {schemaFields
                                .filter((f) => !f.is_join)
                                .map((f) => (
                                  <option key={f.column} value={f.column}>{f.label}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Location / Address">
                              {schemaFields
                                .filter((f) => f.is_join && (f as any).table === "locations")
                                .map((f) => (
                                  <option key={f.column} value={f.column}>{f.label}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Household">
                              {schemaFields
                                .filter((f) => f.is_join && (f as any).table === "households")
                                .map((f) => (
                                  <option key={f.column} value={f.column}>{f.label}</option>
                                ))}
                            </optgroup>
                          </>
                        ) : (
                          /* Fallback if schema didn't load */
                          <>
                            <optgroup label="People">
                              {TARGET_FIELDS.filter((f) =>
                                f.value !== "__skip__" && f.value !== "__create__" && !LOCATION_FIELD_COLS.has(f.value)
                              ).map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Location / Address">
                              {TARGET_FIELDS.filter((f) => LOCATION_FIELD_COLS.has(f.value)).map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                          </>
                        )}
                      </select>
                    </td>
                    <td style={{ ...td, color: "var(--gg-text-dim, #9ca3af)", fontSize: 12 }}>
                      {parsed.rows.slice(0, 3).map((r) => r[col]).filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasName && (
            <p style={{ margin: 0, fontSize: 13, color: "#f59e0b" }}>
              ⚠ Map at least one of First Name or Last Name to continue.
            </p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={ghostBtn}>← Back</button>
            <button
              onClick={goToPreview}
              disabled={!hasName}
              style={primaryBtn(!hasName)}
            >
              Preview →
            </button>
          </div>
        </>
      )}

      {/* ── Step 3: Preview + Tenant ── */}
      {step === "preview" && parsed && (
        <>
          <p style={{ margin: 0, fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>
            Preview of first 5 rows after mapping. Ready to import{" "}
            <strong>{parsed.rows.length.toLocaleString()}</strong> records.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--gg-border, #e5e7eb)" }}>
                  {mappedFields.map((f) => (
                    <th key={f.value} style={th}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--gg-border, #f3f4f6)" }}>
                    {mappedFields.map((f) => (
                      <td key={f.value} style={td}>{row[f.value] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isSuperAdmin && tenants.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 14, fontWeight: 600 }}>Import into tenant:</label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 6, fontSize: 14 }}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.id.slice(0, 8)}…)</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep("map")} style={ghostBtn}>← Edit mapping</button>
            <button
              onClick={runValidate}
              disabled={importing}
              style={primaryBtn(importing)}
            >
              {importing ? "Validating…" : `Validate Import (${parsed.rows.length.toLocaleString()} rows)`}
            </button>
          </div>

          {importing && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>
              Analyzing rows — this may take a moment for large files…
            </p>
          )}
        </>
      )}

      {/* ── Step 4: Validation Results ── */}
      {step === "validate" && validateResult && (
        <>
          <div style={{
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 10,
            padding: "28px 32px",
          }}>
            <p style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
              Validation Complete
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, fontSize: 14, marginBottom: 16 }}>
              {[
                { label: "Would Import", value: validateResult.inserted, color: "#16a34a", icon: "✓" },
                { label: "Would Update", value: validateResult.updated, color: "#2563eb", icon: "↻" },
                { label: "Would Skip", value: validateResult.skipped, color: "#9ca3af", icon: "⊘" },
              ].map((stat) => (
                <div key={stat.label} style={{
                  border: "1px solid var(--gg-border, #e5e7eb)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>
                    {stat.icon} {stat.value.toLocaleString()}
                  </div>
                  <div style={{ color: "var(--gg-text-dim, #9ca3af)", marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {validateResult.errors.length > 0 && (
              <details open style={{ marginTop: 0 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "#ef4444", marginBottom: 8 }}>
                  {validateResult.skipped} row{validateResult.skipped !== 1 ? "s" : ""} will be skipped
                  {validateResult.errors.some((e) => e.startsWith("Duplicate")) ? " + duplicate warnings" : ""}
                  {" "}— click to expand
                </summary>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: "var(--gg-text-dim, #6b7280)", display: "grid", gap: 4 }}>
                  {validateResult.errors.map((e, i) => (
                    <li key={i} style={{ color: e.startsWith("Duplicate") ? "#f59e0b" : "inherit" }}>{e}</li>
                  ))}
                </ul>
              </details>
            )}

            {validateResult.skipped === 0 && validateResult.errors.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "#16a34a" }}>
                ✓ All rows passed validation — ready to import.
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={reset} style={ghostBtn}>← Start over</button>
            <button
              onClick={runImport}
              disabled={importing}
              style={primaryBtn(importing)}
            >
              {importing
                ? "Importing…"
                : validateResult.skipped > 0
                  ? `Import Anyway (${(validateResult.inserted + validateResult.updated).toLocaleString()} valid rows)`
                  : `Import ${(validateResult.inserted + validateResult.updated).toLocaleString()} rows`}
            </button>
          </div>

          {importing && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>
              Processing — this may take a minute for large files…
            </p>
          )}
        </>
      )}

      {/* ── Step 5: Done ── */}
      {step === "done" && result && (
        <>
          <div style={{
            border: "1px solid var(--gg-border, #e5e7eb)",
            borderRadius: 10,
            padding: "28px 32px",
          }}>
            <p style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "inherit" }}>
              {result.failed > 0 && result.inserted + result.updated === 0
                ? "❌ Import failed"
                : "✓ Import complete"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, fontSize: 14 }}>
              {[
                { label: "Inserted", value: result.inserted, color: "#16a34a" },
                { label: "Updated", value: result.updated, color: "#2563eb" },
                { label: "Skipped", value: result.skipped, color: "#9ca3af" },
                { label: "Failed", value: result.failed, color: result.failed > 0 ? "#ef4444" : "#9ca3af" },
              ].map((stat) => (
                <div key={stat.label} style={{
                  border: "1px solid var(--gg-border, #e5e7eb)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>
                    {stat.value.toLocaleString()}
                  </div>
                  <div style={{ color: "var(--gg-text-dim, #9ca3af)", marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "#ef4444" }}>
                  {result.errors.length} error{result.errors.length !== 1 ? "s" : ""} — click to expand
                </summary>
                <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={primaryBtn(false)}>Import another file</button>
            <a href="/crm/people" style={{ ...ghostBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              View People →
            </a>
          </div>
        </>
      )}
    </section>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  color: "var(--gg-text-dim, #6b7280)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 12px",
  verticalAlign: "middle",
};

const ghostBtn: React.CSSProperties = {
  padding: "8px 16px",
  border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 6,
  background: "transparent",
  cursor: "pointer",
  fontSize: 14,
  color: "var(--gg-text, #374151)",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 22px",
    background: disabled ? "rgba(0,0,0,0.2)" : "var(--gg-primary, #2563eb)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
