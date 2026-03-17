// lib/crm/import-validation.ts
// Pure validation and normalization functions for the import pipeline.
// A row is skipped entirely if any present field fails validation.

export interface MappedRow {
  first_name?: string;
  last_name?: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __meta?: Record<string, any>;
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
