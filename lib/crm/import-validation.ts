// lib/crm/import-validation.ts
// Pure validation and normalization functions for the import pipeline.
// A row is skipped entirely if any present field fails validation.

export interface MappedRow {
  // ── Core fields (existing) ─────────────────────────────────────────────────
  title?: string;
  first_name?: string;
  middle_name?: string;
  middle_initial?: string;
  last_name?: string;
  suffix?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address?: string; // alias for address_line1
  city?: string;
  state?: string;
  postal_code?: string;
  contact_type?: string;
  occupation?: string;
  notes?: string;

  // ── People: L2 voter identity ──────────────────────────────────────────────
  lalvoteid?: string;
  state_voter_id?: string;
  county_voter_id?: string;
  gender?: string;
  birth_date?: string;
  age?: string;
  party?: string;
  party_switcher?: string;
  voter_status?: string;
  registration_date?: string;
  permanent_absentee?: string;
  veteran?: string;
  do_not_call?: string;
  place_of_birth?: string;
  phone_cell?: string;
  phone_landline?: string;
  mailing_address?: string;

  // ── People: L2 political scores ────────────────────────────────────────────
  score_prog_dem?: string;
  score_mod_dem?: string;
  score_cons_rep?: string;
  score_mod_rep?: string;

  // ── People: L2 voting history ──────────────────────────────────────────────
  voting_frequency?: string;
  early_voter?: string;
  absentee_type?: string;

  // ── People: L2 demographics ────────────────────────────────────────────────
  ethnicity?: string;
  ethnicity_source?: string;
  hispanic_origin?: string;
  language?: string;
  english_proficiency?: string;
  education_level?: string;
  marital_status?: string;
  religion?: string;

  // ── People: L2 professional / financial / mover ────────────────────────────
  occupation_title?: string;
  company_name?: string;
  income_range?: string;
  net_worth_range?: string;
  length_of_residence?: string;
  moved_from_state?: string;

  // ── Households: L2 composition ────────────────────────────────────────────
  total_persons?: string;
  adults_count?: string;
  children_count?: string;
  generations_count?: string;
  has_senior?: string;
  has_young_adult?: string;
  has_children?: string;
  is_single_parent?: string;
  has_disabled?: string;
  household_voter_count?: string;
  household_parties?: string;
  head_of_household?: string;
  household_gender?: string;
  home_owner?: string;
  home_estimated_value?: string;
  home_purchase_year?: string;
  home_dwelling_type?: string;
  home_sqft?: string;
  home_bedrooms?: string;

  // ── Locations: L2 districts + geo ─────────────────────────────────────────
  congressional_district?: string;
  state_house_district?: string;
  state_senate_district?: string;
  state_legislative_district?: string;
  county_name?: string;
  fips_code?: string;
  precinct?: string;
  municipality?: string;
  municipal_subdistrict?: string;
  county_commission_district?: string;
  county_supervisor_district?: string;
  school_district?: string;
  college_district?: string;
  judicial_district?: string;
  time_zone?: string;
  urbanicity?: string;
  population_density?: string;
  census_tract?: string;
  census_block_group?: string;
  census_block?: string;
  dma?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __meta?: Record<string, any>;

  // ── Tenant-specific (link table) ──────────────────────────────────────────
  // Named typed columns on tenant_people (notes, contact_type)
  __tenant_people?: Record<string, string>;
  // Freeform keys → tenant_people.custom_data JSONB
  __tenant_custom?: Record<string, string>;
  // External giving history: cycle_year (string) → amount in cents (string)
  // e.g. { "2024": "32500", "2022": "15000" }
  __giving?: Record<string, string>;

  // ── Company import ─────────────────────────────────────────────────────────
  // Fields for the companies table
  __company?: Record<string, string>;
  // Point-of-contact person fields
  __contact?: Record<string, string>;

  // ── Donation history import (Shape B: one transaction per row) ─────────────
  __donation?: { amount: string; date: string };
}

export type ValidationResult =
  | { valid: true; normalized: MappedRow }
  | { valid: false; reason: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC","PR","GU","VI","AS","MP",
]);

// Valid address patterns (case-insensitive)
const ADDRESS_PATTERNS = [
  /^\d/,                          // starts with a digit (standard street)
  /^p\.?o\.?\s*box/i,             // PO Box
  /^(rural\s+route|rr\s+\d)/i,   // Rural Route
  /^hc\s+\d/i,                    // Highway Contract
  /^general\s+delivery/i,         // General Delivery
  /^psc\s+\d/i,                   // Military PSC
];

// ─── Individual validators ────────────────────────────────────────────────────

export function validatePhone(raw: string): { ok: boolean; normalized: string } {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, normalized: raw };
  const normalized = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return { ok: true, normalized };
}

export function validateEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export function validateAddress(raw: string): { ok: boolean; normalized: string } {
  const trimmed = raw.trim();
  const matches = ADDRESS_PATTERNS.some((p) => p.test(trimmed));
  if (!matches) return { ok: false, normalized: trimmed };

  // Normalize PO Box variants → "PO Box ###"
  const normalized = trimmed.replace(/^p\.?o\.?\s*box/i, "PO Box");
  return { ok: true, normalized };
}

export function validatePostalCode(raw: string): { ok: boolean; normalized: string } {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (digits.length !== 5) return { ok: false, normalized: raw };
  return { ok: true, normalized: digits };
}

export function validateState(raw: string): { ok: boolean; normalized: string } {
  const upper = raw.trim().toUpperCase();
  if (!US_STATES.has(upper)) return { ok: false, normalized: raw };
  return { ok: true, normalized: upper };
}

export function validateCity(raw: string): boolean {
  const trimmed = raw.trim();
  // Reject if entirely numeric or contains no letters at all
  return /[a-zA-Z]/.test(trimmed);
}

// ─── Row-level validator ─────────────────────────────────────────────────────

export function validateRow(row: MappedRow, rowNum: number): ValidationResult {
  const out: MappedRow = { ...row };

  // Trim all string fields first
  for (const key of Object.keys(out) as (keyof MappedRow)[]) {
    if (typeof out[key] === "string") {
      (out[key] as string) = (out[key] as string).trim();
    }
  }

  // Name — required
  const firstName = out.first_name ?? "";
  const lastName = out.last_name ?? "";
  if (!firstName && !lastName) {
    return { valid: false, reason: `Row ${rowNum}: record must have at least a first or last name` };
  }

  // Phone — optional, but must be valid if present
  const rawPhone = out.phone ?? "";
  if (rawPhone) {
    const result = validatePhone(rawPhone);
    if (!result.ok) {
      return { valid: false, reason: `Row ${rowNum}: phone '${rawPhone}' is not a valid 10-digit US number` };
    }
    out.phone = result.normalized;
  }

  // Email — optional, but must be valid if present
  const rawEmail = out.email ?? "";
  if (rawEmail) {
    const normalized = rawEmail.toLowerCase();
    if (!validateEmail(normalized)) {
      return { valid: false, reason: `Row ${rowNum}: email '${rawEmail}' is not a valid email address` };
    }
    out.email = normalized;
  }

  // Address — optional, but must be valid if present
  const rawAddr = out.address_line1 ?? out.address ?? "";
  if (rawAddr) {
    const result = validateAddress(rawAddr);
    if (!result.ok) {
      return { valid: false, reason: `Row ${rowNum}: address '${rawAddr}' is not a recognized address format (must start with a number, or be a PO Box, Rural Route, etc.)` };
    }
    out.address_line1 = result.normalized;
    out.address = result.normalized;
  }

  // Postal code — optional, but must be valid if present
  const rawZip = out.postal_code ?? "";
  if (rawZip) {
    const result = validatePostalCode(rawZip);
    if (!result.ok) {
      return { valid: false, reason: `Row ${rowNum}: postal_code '${rawZip}' is not a valid 5-digit ZIP code` };
    }
    out.postal_code = result.normalized;
  }

  // State — optional, but must be valid if present
  const rawState = out.state ?? "";
  if (rawState) {
    const result = validateState(rawState);
    if (!result.ok) {
      return { valid: false, reason: `Row ${rowNum}: state '${rawState}' is not a recognized US state/territory abbreviation` };
    }
    out.state = result.normalized;
  }

  // City — optional, but must contain at least one letter if present
  const rawCity = out.city ?? "";
  if (rawCity && !validateCity(rawCity)) {
    return { valid: false, reason: `Row ${rowNum}: city '${rawCity}' does not appear to be a valid city name` };
  }

  return { valid: true, normalized: out };
}

// ─── Intra-file duplicate detection ─────────────────────────────────────────

export function findDuplicateEmails(rows: MappedRow[]): string[] {
  const seen = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email) return;
    const existing = seen.get(email) ?? [];
    existing.push(i + 1);
    seen.set(email, existing);
  });
  const warnings: string[] = [];
  for (const [email, rowNums] of seen.entries()) {
    if (rowNums.length > 1) {
      warnings.push(`Duplicate email '${email}' found on rows ${rowNums.join(", ")} — only the last will be kept`);
    }
  }
  return warnings;
}
