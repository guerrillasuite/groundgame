"use client";

import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { L2_FIELD_MAP } from "@/lib/crm/l2-field-map";

// ── Types ──────────────────────────────────────────────────────────────────

type TargetField =
  // Core
  | "title" | "first_name" | "middle_name" | "middle_initial" | "last_name" | "suffix"
  | "email" | "phone"
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
  // Locations: GIS address components
  | "house_number" | "pre_dir" | "street_name" | "street_suffix" | "post_dir"
  | "unit" | "parcel_id" | "postal_community" | "full_address" | "source_row_id"
  // Locations: L2 districts + geo
  | "congressional_district" | "state_house_district" | "state_senate_district"
  | "state_legislative_district" | "county_name" | "fips_code" | "precinct"
  | "municipality" | "municipal_subdistrict" | "county_commission_district"
  | "county_supervisor_district" | "school_district" | "college_district"
  | "judicial_district" | "time_zone" | "urbanicity" | "population_density"
  | "census_tract" | "census_block_group" | "census_block" | "dma"
  // Tenant-specific (link table)
  | "tp_notes" | "tp_contact_type"
  // Company import
  | "co_name" | "co_domain" | "co_phone" | "co_email"
  | "co_industry" | "co_status" | "co_presence"
  | "co_contact_first" | "co_contact_last" | "co_contact_email"
  | "co_contact_phone" | "co_contact_title"
  // Donation history (Shape B — transaction per row)
  | "dn_first" | "dn_last" | "dn_email" | "dn_zip" | "dn_amount" | "dn_date"
  | "__skip__" | "__create__" | "__create_global__" | "__giving_cycle__";

const TARGET_FIELDS: { value: TargetField; label: string }[] = [
  { value: "__skip__",    label: "— skip —" },
  { value: "__create__",  label: "→ Create field (use column name)" },
  { value: "title",          label: "Title (Mr./Mrs./Dr. etc.)" },
  { value: "first_name",     label: "First Name" },
  { value: "middle_name",    label: "Middle Name" },
  { value: "middle_initial", label: "Middle Initial" },
  { value: "last_name",      label: "Last Name" },
  { value: "suffix",         label: "Suffix (Jr./Sr./III etc.)" },
  { value: "email",       label: "Email" },
  { value: "phone",       label: "Phone" },
  { value: "contact_type",label: "Contact Type" },
  { value: "occupation",  label: "Occupation" },
  { value: "notes",       label: "Notes" },
  { value: "address_line1",  label: "Street Address (full)" },
  { value: "city",           label: "City" },
  { value: "state",          label: "State" },
  { value: "postal_code",    label: "Zip Code" },
  { value: "unit",           label: "Unit / Apt" },
  // GIS address components — assembled into address_line1 automatically
  { value: "house_number",   label: "GIS: Address Number" },
  { value: "pre_dir",        label: "GIS: Pre-Directional (N/S/E/W)" },
  { value: "street_name",    label: "GIS: Street Name" },
  { value: "street_suffix",  label: "GIS: Street Suffix (Way/Road/etc.)" },
  { value: "post_dir",       label: "GIS: Post-Directional" },
  { value: "postal_community", label: "GIS: Postal Community (city name)" },
  { value: "parcel_id",      label: "GIS: Parcel ID / APN" },
  { value: "full_address",   label: "GIS: Full Address String" },
  { value: "source_row_id",  label: "GIS: Source Row ID (OBJECTID)" },
];

// Auto-detect common column name → target field
const AUTO_MAP: Record<string, TargetField> = {
  title: "title", salutation: "title", honorific: "title", prefix: "title", name_prefix: "title",
  first_name: "first_name", fname: "first_name", first: "first_name", firstname: "first_name",
  middle_name: "middle_name", middlename: "middle_name", middle: "middle_name",
  middle_initial: "middle_initial", middleinitial: "middle_initial", mi: "middle_initial",
  last_name: "last_name", lname: "last_name", last: "last_name", lastname: "last_name", surname: "last_name",
  suffix: "suffix", name_suffix: "suffix", namesuffix: "suffix",
  email: "email", email_address: "email", emailaddress: "email",
  phone: "phone", phone_number: "phone", phonenumber: "phone", cell: "phone", mobile: "phone", telephone: "phone",
  address: "address_line1", street: "address_line1", street_address: "address_line1",
  address1: "address_line1", addr: "address_line1", address_line1: "address_line1",
  city: "city",
  state: "state", st: "state",
  zip: "postal_code", zipcode: "postal_code", zip_code: "postal_code",
  postal_code: "postal_code", zip5: "postal_code", postalcode: "postal_code",
  post_code: "postal_code",
  contact_type: "contact_type", type: "contact_type", party: "contact_type",
  party_affiliation: "contact_type", partyaffiliation: "contact_type",
  occupation: "occupation", job: "occupation", employer_name: "occupation",
  notes: "notes", comments: "notes", note: "notes",
  // GIS address component column names
  address_number: "house_number", house_number: "house_number", houseno: "house_number",
  street_name_pre_directional: "pre_dir", pre_directional: "pre_dir", pre_dir: "pre_dir",
  street_name_pre_modifier: "__skip__",
  street_name_pre_type: "__skip__",
  street_name_pre_type_separator: "__skip__",
  street_name: "street_name",
  street_name_post_type: "street_suffix", street_suffix: "street_suffix", post_type: "street_suffix",
  street_name_post_directional: "post_dir", post_directional: "post_dir", post_dir: "post_dir",
  street_name_post_modifier: "__skip__",
  unit: "unit", apt: "unit", apartment: "unit", suite: "unit",
  zip_community: "postal_community", postal_community: "postal_community",
  incorporated_municipality: "__skip__",
  apn: "parcel_id", parcel_id: "parcel_id", parcel_number: "parcel_id",
  ccra_address: "full_address", full_address: "full_address",
  objectid: "source_row_id", source_row_id: "source_row_id", gid: "source_row_id",
  x: "__skip__", y: "__skip__",  // projected coordinates need reprojection — skip by default
};

function autoDetect(col: string): TargetField {
  const key = col.trim().toLowerCase().replace(/[\s-]/g, "_");
  // Check L2 map first
  const l2 = L2_FIELD_MAP[key];
  if (l2) {
    if (l2.dest === "meta") return "__create_global__"; // L2 extra fields → shared community data
    return l2.column as TargetField;
  }
  // Detect giving cycle columns: "2024 Total", "giving_2022", "FY2024", "cycle_2026", etc.
  if (/\b(20[12]\d)\b/.test(key)) return "__giving_cycle__";
  return AUTO_MAP[key] ?? "__skip__";
}

/** Extract a 4-digit year from a column name, if present. */
function extractYearFromCol(col: string): string {
  const m = col.match(/\b(20[12]\d)\b/);
  return m ? m[1] : "";
}

/** Snap any year to its election cycle end year (odd → next even). */
function toCycleYear(year: number): number {
  return year % 2 === 0 ? year : year + 1;
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
  insertedPersonIds?: string[];
  insertedCompanyIds?: string[];
  importType?: 'people' | 'companies' | 'donations' | 'locations';
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

export default function ImportPanel({ hasEnrichment = true }: { hasEnrichment?: boolean }) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<Record<string, TargetField>>({});
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [importMode, setImportMode] = useState<"fill_blanks" | "smart_merge" | "override">("smart_merge");
  const [importType, setImportType] = useState<"people" | "companies" | "donations" | "locations">("people");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validateResult, setValidateResult] = useState<ImportResult | null>(null);
  const [parseErr, setParseErr] = useState("");
  const [dragging, setDragging] = useState(false);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [oppsCreated, setOppsCreated] = useState<number | null>(null);
  const [createOppsOnImport, setCreateOppsOnImport] = useState(false);
  // col → canonical key override for __create_global__ fields
  const [globalKeyOverrides, setGlobalKeyOverrides] = useState<Record<string, string>>({});
  // col → cycle year (4-digit string) for __giving_cycle__ fields
  const [givingCycleYears, setGivingCycleYears] = useState<Record<string, string>>({});
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
      const autoGivingYears: Record<string, string> = {};
      for (const h of data.headers) {
        autoMapping[h] = autoDetect(h);
        if (!hasEnrichment && autoMapping[h] === "__create_global__") {
          autoMapping[h] = "__skip__";
        }
        if (autoMapping[h] === "__giving_cycle__") {
          const y = extractYearFromCol(h);
          if (y) autoGivingYears[h] = String(toCycleYear(parseInt(y)));
        }
      }
      setParsed(data);
      setMapping(autoMapping);
      setGivingCycleYears(autoGivingYears);
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

  // GIS address component keys — these get assembled into address_line1 post-loop
  const GIS_ADDR_PARTS = ["house_number", "pre_dir", "street_name", "street_suffix", "post_dir"] as const;

  function buildMappedRows() {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: Record<string, any> = {};
      const globalMeta: Record<string, string> = {};
      const tenantNamed: Record<string, string> = {};
      const tenantCustom: Record<string, string> = {};
      const giving: Record<string, string> = {};   // cycleYear → raw amount string
      const donation: { amount: string; date: string } = { amount: "", date: "" };
      const company: Record<string, string> = {};
      const contact: Record<string, string> = {};
      for (const [col, target] of Object.entries(mapping)) {
        const val = (row[col] ?? "").trim();
        if (!val) continue;
        if (target === "__giving_cycle__") {
          const year = (givingCycleYears[col] ?? extractYearFromCol(col)).trim();
          if (year) giving[String(toCycleYear(parseInt(year) || 0))] = val;
        } else if (target === "__create_global__") {
          const key = (globalKeyOverrides[col] ?? col).trim() || col;
          globalMeta[key] = val;
        } else if (target === "__create__") {
          tenantCustom[col] = val;
        } else if (target === "tp_notes") {
          tenantNamed.notes = val;
        } else if (target === "tp_contact_type") {
          tenantNamed.contact_type = val;
        } else if (target === "dn_amount") {
          donation.amount = val;
        } else if (target === "dn_date") {
          donation.date = val;
        } else if (target === "dn_first") {
          out.first_name = val;
        } else if (target === "dn_last") {
          out.last_name = val;
        } else if (target === "dn_email") {
          out.email = val;
        } else if (target === "dn_zip") {
          out.postal_code = val;
        } else if (target.startsWith("co_contact_")) {
          contact[target.slice("co_contact_".length)] = val;
        } else if (target.startsWith("co_")) {
          company[target.slice(3)] = val;
        } else if (target !== "__skip__") {
          out[target] = val;
        }
      }
      if (Object.keys(globalMeta).length > 0)   out.__meta          = globalMeta;
      if (Object.keys(tenantNamed).length > 0)  out.__tenant_people = tenantNamed;
      if (Object.keys(tenantCustom).length > 0) out.__tenant_custom = tenantCustom;
      if (Object.keys(giving).length > 0)       out.__giving        = giving;
      if (donation.amount)                       out.__donation      = donation;
      if (Object.keys(company).length > 0)      out.__company       = company;
      if (Object.keys(contact).length > 0)      out.__contact       = contact;

      // Assemble address_line1 from GIS components if not already provided
      if (!out.address_line1) {
        const parts = GIS_ADDR_PARTS.map((k) => (out[k] ?? "").trim()).filter(Boolean);
        if (parts.length > 0) out.address_line1 = parts.join(" ");
      }
      // Fall back to full_address if still no address_line1
      if (!out.address_line1 && out.full_address) {
        out.address_line1 = out.full_address;
      }
      // Use postal_community as city if city not set
      if (!out.city && out.postal_community) {
        out.city = out.postal_community;
      }

      return out;
    });
  }

  // ── Validate (dry run) ─────────────────────────────────────────────────────

  // ── Chunked POST helper ────────────────────────────────────────────────────

  const CHUNK_SIZE = 500;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function postChunk(rows: Record<string, any>[], dryRun: boolean): Promise<ImportResult> {
    // Fetch a fresh token every chunk so token rotation mid-loop never causes 401s
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = { rows, dryRun, importMode, importType };
    if (isSuperAdmin && selectedTenant) body.tenant_id = selectedTenant;

    const res = await fetch("/api/crm/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `Server error ${res.status}`;
      try { msg = JSON.parse(text).error ?? msg; } catch { /* non-JSON error body */ }
      throw new Error(msg);
    }

    return res.json();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function chunkArr<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // ── Validate (dry run) ─────────────────────────────────────────────────────

  async function runValidate() {
    if (!parsed) return;
    setImporting(true);
    setValidateResult(null);

    try {
      const chunks = chunkArr(buildMappedRows(), CHUNK_SIZE);
      const acc: ImportResult = { dryRun: true, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

      for (const chunk of chunks) {
        const data = await postChunk(chunk, true);
        acc.inserted += data.inserted;
        acc.updated  += data.updated;
        acc.skipped  += data.skipped;
        acc.failed   += data.failed;
        if (data.errors) acc.errors.push(...data.errors);
      }

      setValidateResult(acc);
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
      const chunks = chunkArr(buildMappedRows(), CHUNK_SIZE);
      const acc: ImportResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [], insertedPersonIds: [], insertedCompanyIds: [] };

      for (const chunk of chunks) {
        const data = await postChunk(chunk, false);
        acc.inserted += data.inserted;
        acc.updated  += data.updated;
        acc.skipped  += data.skipped;
        acc.failed   += data.failed;
        if (data.errors) acc.errors.push(...data.errors);
        if (data.insertedPersonIds)  acc.insertedPersonIds!.push(...data.insertedPersonIds);
        if (data.insertedCompanyIds) acc.insertedCompanyIds!.push(...data.insertedCompanyIds);
        if (data.importType) acc.importType = data.importType;
      }

      setResult(acc);
      setStep("done");
      if (createOppsOnImport && ((acc.insertedPersonIds?.length ?? 0) + (acc.insertedCompanyIds?.length ?? 0)) > 0) {
        handleCreateOpps(acc);
      }
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
    setImportMode("smart_merge");
    setImportType("people");
    setOppsCreated(null);
    setOppsLoading(false);
    setCreateOppsOnImport(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleCreateOpps(resultArg?: ImportResult) {
    const r = resultArg ?? result;
    if (!r) return;
    setOppsLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const body: Record<string, any> = {};
      if (r.insertedPersonIds?.length)  body.personIds  = r.insertedPersonIds;
      if (r.insertedCompanyIds?.length) body.companyIds = r.insertedCompanyIds;
      const res = await fetch("/api/crm/opportunities/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create opportunities");
      setOppsCreated(data.created ?? 0);
    } catch (e: any) {
      alert((e as Error).message);
    } finally {
      setOppsLoading(false);
    }
  }

  // ── Check mapping validity ──────────────────────────────────────────────────

  const mappedTargets = Object.values(mapping);
  const canProceed = importType === "companies"
    ? mappedTargets.includes("co_name")
    : importType === "donations"
    ? mappedTargets.includes("dn_amount") &&
      (mappedTargets.includes("dn_email") || mappedTargets.includes("dn_first") || mappedTargets.includes("dn_last"))
    : importType === "locations"
    ? mappedTargets.includes("address_line1") || mappedTargets.includes("full_address") ||
      (mappedTargets.includes("house_number") && mappedTargets.includes("street_name")) ||
      (mappedTargets.includes("house_number") && mappedTargets.includes("street_suffix"))
    : (mappedTargets.includes("first_name") || mappedTargets.includes("last_name"));

  // Preview rows (first 5, with mapping applied)
  const previewRows = (parsed?.rows ?? []).slice(0, 5).map((row) => {
    const out: Record<string, string> = {};
    for (const [col, target] of Object.entries(mapping)) {
      if (target === "__giving_cycle__") {
        const year = (givingCycleYears[col] ?? extractYearFromCol(col)).trim();
        if (year) out[`__giving__${toCycleYear(parseInt(year) || 0)}`] = (row[col] ?? "").trim();
      } else if (target === "__create_global__") {
        const key = (globalKeyOverrides[col] ?? col).trim() || col;
        out[`__global__${key}`] = (row[col] ?? "").trim();
      } else if (target === "__create__") {
        out[`__custom__${col}`] = (row[col] ?? "").trim();
      } else if (target !== "__skip__") {
        out[target] = (row[col] ?? "").trim();
      }
    }
    return out;
  });

  // Build preview column list: schema-known fields + custom "create" columns
  const allFieldOptions = schemaFields.length > 0
    ? schemaFields.map((f) => ({ value: f.column, label: f.label }))
    : TARGET_FIELDS.filter((f) => f.value !== "__skip__" && f.value !== "__create__" && f.value !== "__create_global__");

  const mappedFields = [
    ...allFieldOptions.filter((f) => mappedTargets.includes(f.value as TargetField)),
    ...Object.entries(mapping)
      .filter(([, t]) => t === "__giving_cycle__")
      .map(([col]) => {
        const year = (givingCycleYears[col] ?? extractYearFromCol(col)).trim();
        const cy = year ? toCycleYear(parseInt(year) || 0) : "?";
        return { value: `__giving__${cy}`, label: `Giving ${cy} cycle` };
      }),
    ...Object.entries(mapping)
      .filter(([, t]) => t === "__create_global__")
      .map(([col]) => {
        const key = (globalKeyOverrides[col] ?? col).trim() || col;
        return { value: `__global__${key}`, label: `${key} (shared)` };
      }),
    ...Object.entries(mapping)
      .filter(([, t]) => t === "__create__")
      .map(([col]) => ({ value: `__custom__${col}`, label: `${col} (org only)` })),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="stack">
      <h1 style={{ margin: 0 }}>Import Data</h1>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <>
          {/* Import type toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {(["people", "companies", "donations", "locations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setImportType(t)}
                style={{
                  padding: "7px 18px", borderRadius: 6, fontWeight: 600, fontSize: 14,
                  border: `1px solid ${importType === t ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                  background: importType === t ? "var(--gg-primary-faint, #eff6ff)" : "transparent",
                  color: importType === t ? "var(--gg-primary, #2563eb)" : "var(--gg-text, #374151)",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {t}
              </button>
            ))}
          </div>
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
                        {importType !== "donations" && (
                          <>
                            <option value="__create__">→ Custom field (this org only)</option>
                            {hasEnrichment && (
                              <option value="__create_global__">→ Custom field (shared / community)</option>
                            )}
                          </>
                        )}

                        {importType === "donations" ? (
                          <>
                            <optgroup label="Person Identifier">
                              <option value="dn_first">First Name</option>
                              <option value="dn_last">Last Name</option>
                              <option value="dn_email">Email</option>
                              <option value="dn_zip">Zip Code</option>
                            </optgroup>
                            <optgroup label="Transaction">
                              <option value="dn_amount">Amount (dollars)</option>
                              <option value="dn_date">Date</option>
                            </optgroup>
                          </>
                        ) : importType === "companies" ? (
                          <>
                            <optgroup label="Company">
                              <option value="co_name">Company Name</option>
                              <option value="co_domain">Domain</option>
                              <option value="co_phone">Phone</option>
                              <option value="co_email">Email</option>
                              <option value="co_industry">Industry</option>
                              <option value="co_status">Status</option>
                              <option value="co_presence">Presence</option>
                            </optgroup>
                            <optgroup label="Point of Contact">
                              <option value="co_contact_first">First Name</option>
                              <option value="co_contact_last">Last Name</option>
                              <option value="co_contact_email">Email</option>
                              <option value="co_contact_phone">Phone</option>
                              <option value="co_contact_title">Job Title</option>
                            </optgroup>
                            <optgroup label="Tenant Tracking">
                              <option value="tp_notes">Notes (this org only)</option>
                              <option value="tp_contact_type">Contact Type (this org only)</option>
                            </optgroup>
                            <optgroup label="Giving History (external)">
                              <option value="__giving_cycle__">→ Giving – cycle year (set below)</option>
                            </optgroup>
                          </>
                        ) : importType === "locations" ? (
                          <>
                            <optgroup label="Address (full string)">
                              <option value="address_line1">Street Address (full)</option>
                              <option value="full_address">Full Address String (GIS)</option>
                            </optgroup>
                            <optgroup label="GIS Address Components → assembled into address_line1">
                              <option value="house_number">Address Number</option>
                              <option value="pre_dir">Pre-Directional (N/S/E/W)</option>
                              <option value="street_name">Street Name</option>
                              <option value="street_suffix">Street Suffix (Way/Road/etc.)</option>
                              <option value="post_dir">Post-Directional</option>
                              <option value="unit">Unit / Apt</option>
                            </optgroup>
                            <optgroup label="City / State / Zip">
                              <option value="city">City</option>
                              <option value="postal_community">Postal Community (GIS city name)</option>
                              <option value="state">State</option>
                              <option value="postal_code">Zip Code</option>
                            </optgroup>
                            <optgroup label="GIS Extras">
                              <option value="parcel_id">Parcel ID / APN</option>
                              <option value="source_row_id">Source Row ID (OBJECTID)</option>
                              <option value="municipality">Municipality</option>
                            </optgroup>
                            <optgroup label="Districts">
                              <option value="congressional_district">Congressional District</option>
                              <option value="state_house_district">State House District</option>
                              <option value="state_senate_district">State Senate District</option>
                              <option value="county_name">County Name</option>
                              <option value="precinct">Precinct</option>
                              <option value="fips_code">FIPS Code</option>
                              <option value="census_tract">Census Tract</option>
                              <option value="census_block_group">Census Block Group</option>
                              <option value="census_block">Census Block</option>
                            </optgroup>
                          </>
                        ) : schemaFields.length > 0 ? (
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
                            <optgroup label="GIS Address Components → assembled into address_line1">
                              <option value="house_number">Address Number</option>
                              <option value="pre_dir">Pre-Directional (N/S/E/W)</option>
                              <option value="street_name">Street Name</option>
                              <option value="street_suffix">Street Suffix (Way/Road/etc.)</option>
                              <option value="post_dir">Post-Directional</option>
                              <option value="unit">Unit / Apt</option>
                              <option value="postal_community">Postal Community (GIS city name)</option>
                              <option value="parcel_id">Parcel ID / APN</option>
                              <option value="full_address">Full Address String (GIS)</option>
                              <option value="source_row_id">Source Row ID (OBJECTID)</option>
                            </optgroup>
                            <optgroup label="Household">
                              {schemaFields
                                .filter((f) => f.is_join && (f as any).table === "households")
                                .map((f) => (
                                  <option key={f.column} value={f.column}>{f.label}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Tenant Tracking">
                              <option value="tp_notes">Notes (this org only)</option>
                              <option value="tp_contact_type">Contact Type (this org only)</option>
                            </optgroup>
                            <optgroup label="Giving History (external)">
                              <option value="__giving_cycle__">→ Giving – cycle year (set below)</option>
                            </optgroup>
                          </>
                        ) : (
                          /* Fallback if schema didn't load */
                          <>
                            <optgroup label="People">
                              {TARGET_FIELDS.filter((f) =>
                                f.value !== "__skip__" && f.value !== "__create__" && f.value !== "__create_global__"
                                && !LOCATION_FIELD_COLS.has(f.value)
                                && !f.value.startsWith("tp_") && !f.value.startsWith("co_")
                                && !f.value.startsWith("gis_")
                              ).map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Location / Address">
                              {TARGET_FIELDS.filter((f) => LOCATION_FIELD_COLS.has(f.value)).map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="GIS Address Components → assembled into address_line1">
                              <option value="house_number">Address Number</option>
                              <option value="pre_dir">Pre-Directional (N/S/E/W)</option>
                              <option value="street_name">Street Name</option>
                              <option value="street_suffix">Street Suffix (Way/Road/etc.)</option>
                              <option value="post_dir">Post-Directional</option>
                              <option value="unit">Unit / Apt</option>
                              <option value="postal_community">Postal Community (GIS city name)</option>
                              <option value="parcel_id">Parcel ID / APN</option>
                              <option value="full_address">Full Address String (GIS)</option>
                              <option value="source_row_id">Source Row ID (OBJECTID)</option>
                            </optgroup>
                            <optgroup label="Tenant Tracking">
                              <option value="tp_notes">Notes (this org only)</option>
                              <option value="tp_contact_type">Contact Type (this org only)</option>
                            </optgroup>
                            <optgroup label="Giving History (external)">
                              <option value="__giving_cycle__">→ Giving – cycle year (set below)</option>
                            </optgroup>
                          </>
                        )}
                      </select>
                      {mapping[col] === "__giving_cycle__" && (
                        <div style={{ marginTop: 5 }}>
                          <span style={{ fontSize: 11, color: "var(--gg-text-dim, #6b7280)" }}>
                            Cycle year (even):
                          </span>
                          <input
                            type="number"
                            value={givingCycleYears[col] ?? extractYearFromCol(col)}
                            onChange={(e) => {
                              const raw = parseInt(e.target.value) || 0;
                              setGivingCycleYears((prev) => ({ ...prev, [col]: String(toCycleYear(raw)) }));
                            }}
                            placeholder="e.g. 2024"
                            min={2000} max={2060} step={2}
                            style={{
                              display: "block", width: "100%", marginTop: 2,
                              padding: "3px 7px", fontSize: 12,
                              border: "1px solid var(--gg-border, #d1d5db)",
                              borderRadius: 4, fontFamily: "monospace",
                              background: "rgba(34,197,94,0.06)",
                            }}
                          />
                        </div>
                      )}
                      {mapping[col] === "__create_global__" && (
                        <div style={{ marginTop: 5 }}>
                          <span style={{ fontSize: 11, color: "var(--gg-text-dim, #6b7280)" }}>
                            Canonical key:
                          </span>
                          <input
                            type="text"
                            value={globalKeyOverrides[col] ?? col}
                            onChange={(e) =>
                              setGlobalKeyOverrides((prev) => ({ ...prev, [col]: e.target.value }))
                            }
                            placeholder={col}
                            style={{
                              display: "block", width: "100%", marginTop: 2,
                              padding: "3px 7px", fontSize: 12,
                              border: "1px solid var(--gg-border, #d1d5db)",
                              borderRadius: 4, fontFamily: "monospace",
                              background: "rgba(234,179,8,0.06)",
                            }}
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: "var(--gg-text-dim, #9ca3af)", fontSize: 12 }}>
                      {parsed.rows.slice(0, 3).map((r) => r[col]).filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!canProceed && (
            <p style={{ margin: 0, fontSize: 13, color: "#f59e0b" }}>
              {importType === "companies"
                ? "⚠ Map Company Name to continue."
                : "⚠ Map at least one of First Name or Last Name to continue."}
            </p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={ghostBtn}>← Back</button>
            <button
              onClick={goToPreview}
              disabled={!canProceed}
              style={primaryBtn(!canProceed)}
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

          {/* Import Mode */}
          <div style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, padding: "14px 18px" }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600 }}>Import Mode</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {([
                { value: "fill_blanks",  label: "Fill Blanks",  desc: "Only write to empty fields — never overwrite existing data" },
                { value: "smart_merge",  label: "Smart Merge",  desc: "Overwrite when incoming data has equal or higher quality (default)" },
                { value: "override",     label: "Override",     desc: "Always overwrite all mapped fields" },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
                    border: `1px solid ${importMode === opt.value ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
                    borderRadius: 7, padding: "8px 12px", flex: "1 1 180px",
                    background: importMode === opt.value ? "var(--gg-primary-faint, #eff6ff)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value={opt.value}
                    checked={importMode === opt.value}
                    onChange={() => setImportMode(opt.value)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 600, display: "block" }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: "var(--gg-text-dim, #6b7280)" }}>{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {importType !== "donations" && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={createOppsOnImport}
                onChange={(e) => setCreateOppsOnImport(e.target.checked)}
              />
              <span>Create one <strong>Lead Opportunity</strong> per new record after import</span>
            </label>
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

          {/* Opportunities result */}
          {oppsCreated !== null && (
            <p style={{ margin: 0, fontSize: 14, color: "#16a34a", fontWeight: 600 }}>
              ✓ {oppsCreated.toLocaleString()} opportunities created —{" "}
              <a href="/crm/opportunities" style={{ color: "#16a34a" }}>View pipeline →</a>
            </p>
          )}
          {oppsLoading && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>Creating opportunities…</p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={primaryBtn(false)}>Import another file</button>
            <a
              href={result.importType === "companies" ? "/crm/companies" : "/crm/people"}
              style={{ ...ghostBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              View {result.importType === "companies" ? "Companies" : "People"} →
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
