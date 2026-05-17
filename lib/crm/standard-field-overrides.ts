import { createClient } from "@supabase/supabase-js";

export type RecordType = "people" | "companies" | "households" | "locations";

export type StandardField = { key: string; defaultLabel: string };

export const STANDARD_FIELDS: Record<RecordType, StandardField[]> = {
  people: [
    { key: "first_name",  defaultLabel: "First Name" },
    { key: "last_name",   defaultLabel: "Last Name" },
    { key: "email",       defaultLabel: "Email" },
    { key: "phone",       defaultLabel: "Phone" },
    { key: "notes",       defaultLabel: "Notes" },
  ],
  companies: [
    { key: "name",        defaultLabel: "Company Name" },
    { key: "industry",    defaultLabel: "Industry" },
    { key: "website",     defaultLabel: "Website" },
    { key: "phone",       defaultLabel: "Phone" },
    { key: "email",       defaultLabel: "Email" },
    { key: "notes",       defaultLabel: "Notes" },
  ],
  households: [
    { key: "name",        defaultLabel: "Household Name" },
    { key: "notes",       defaultLabel: "Notes" },
  ],
  locations: [
    { key: "place_name",  defaultLabel: "Name / Place Name" },
    { key: "notes",       defaultLabel: "Notes" },
  ],
};

export type FieldOverride = {
  id: string;
  tenant_id: string;
  record_type: RecordType;
  field_key: string;
  custom_label: string;
};

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function getFieldOverrides(
  tenantId: string,
  recordType?: RecordType,
): Promise<FieldOverride[]> {
  const sb = makeAdminSb();
  let q = sb
    .from("standard_field_overrides")
    .select("*")
    .eq("tenant_id", tenantId);
  if (recordType) q = q.eq("record_type", recordType);
  const { data } = await q;
  return (data ?? []) as FieldOverride[];
}

/** Returns a map of field_key → custom_label for quick lookup. */
export function overrideMap(overrides: FieldOverride[]): Map<string, string> {
  return new Map(overrides.map(o => [o.field_key, o.custom_label]));
}
