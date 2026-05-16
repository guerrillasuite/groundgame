import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export function makeAdminSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export const RECORD_TYPES = ["people", "companies", "households", "locations", "opportunities", "sitrep_items"] as const;
export type RecordType = typeof RECORD_TYPES[number];

export const FIELD_TYPES = ["text", "textarea", "number", "date", "boolean", "select", "multiselect", "email", "phone", "url", "location"] as const;
export type FieldType = typeof FIELD_TYPES[number];

const RECORD_ABBREVS: Record<RecordType, string> = {
  people:       "ppl",
  companies:    "co",
  households:   "hh",
  locations:    "loc",
  opportunities: "opp",
  sitrep_items: "sr",
};

/** Generate a stable field_key from a label. Never call with a label that's already a key. */
export function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

/** Generate a candidate field_key. Caller must verify uniqueness and append _2/_3 if needed. */
export function makeFieldKey(recordType: RecordType, label: string): string {
  const abbrev = RECORD_ABBREVS[recordType];
  const slug = slugifyLabel(label) || "field";
  return `cf_${abbrev}__${slug}`;
}

/** Find a unique field_key for this tenant + record_type, appending _2/_3 if needed. */
export async function resolveUniqueKey(
  sb: ReturnType<typeof makeAdminSb>,
  tenantId: string,
  recordType: RecordType,
  label: string,
): Promise<string> {
  const base = makeFieldKey(recordType, label);
  const { data: existing } = await sb
    .from("custom_field_definitions")
    .select("field_key")
    .eq("tenant_id", tenantId)
    .eq("record_type", recordType)
    .like("field_key", `${base}%`);

  const taken = new Set((existing ?? []).map((r: any) => r.field_key));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/** Storage column for each record type's custom data. */
export const CUSTOM_COLUMN: Record<RecordType, string> = {
  people:        "custom_data",   // on tenant_people
  companies:     "custom_data",   // on tenant_companies
  households:    "custom_data",
  locations:     "custom_data",
  opportunities: "custom_fields",
  sitrep_items:  "custom_fields",
};

/** DB table for storing field values for each record type. */
export const VALUE_TABLE: Record<RecordType, string> = {
  people:        "tenant_people",
  companies:     "tenant_companies",
  households:    "households",
  locations:     "locations",
  opportunities: "opportunities",
  sitrep_items:  "sitrep_items",
};

/** PK column name for each record's value table. */
export const VALUE_PK: Record<RecordType, string> = {
  people:        "person_id",
  companies:     "company_id",
  households:    "id",
  locations:     "id",
  opportunities: "id",
  sitrep_items:  "id",
};
