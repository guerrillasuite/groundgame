import { NextRequest, NextResponse } from "next/server";

export type ColumnDef = {
  column: string;    // actual DB column name
  label: string;     // display label
  data_type: string; // postgres type ("text", "boolean", "integer", etc.)
  is_join: boolean;  // true = resolved via location join, not direct column
};

// Tables that users can introspect
const ALLOWED_TABLES = ["people", "households", "locations"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

// Columns to always strip out — system/FK/internal/geo
const EXCLUDED_COLS = new Set([
  "id", "tenant_id", "created_at", "updated_at", "synced_at",
  "normalized_key", "household_id", "location_id", "survey_id",
  "walklist_id", "person_id", "question_id", "crm_contact_id",
  "original_position", "order_index", "options",
  // locations — internal / raw geo fields
  "geom", "lon", "lat", "source", "source_row_id",
  "classification_source", "classification_confidence", "classification_evidence",
  "tags_json", "meta_json",
]);

// Virtual joined location fields added for people + households
const LOCATION_JOIN_FIELDS: ColumnDef[] = [
  { column: "city", label: "City", data_type: "text", is_join: true },
  { column: "state", label: "State", data_type: "text", is_join: true },
  { column: "postal_code", label: "Zip Code", data_type: "text", is_join: true },
  { column: "address", label: "Street Address", data_type: "text", is_join: true },
];

// Hardcoded fallback in case service role key is missing
const FALLBACK: Record<AllowedTable, ColumnDef[]> = {
  people: [
    { column: "first_name",   label: "First Name",    data_type: "text",    is_join: false },
    { column: "last_name",    label: "Last Name",     data_type: "text",    is_join: false },
    { column: "email",        label: "Email",         data_type: "text",    is_join: false },
    { column: "phone",        label: "Phone",         data_type: "text",    is_join: false },
    { column: "contact_type", label: "Contact Type",  data_type: "text",    is_join: false },
    { column: "occupation",   label: "Occupation",    data_type: "text",    is_join: false },
    { column: "notes",        label: "Notes",         data_type: "text",    is_join: false },
    { column: "active",       label: "Active",        data_type: "boolean", is_join: false },
    ...LOCATION_JOIN_FIELDS,
  ],
  households: [
    { column: "name", label: "Household Name", data_type: "text", is_join: false },
    ...LOCATION_JOIN_FIELDS,
  ],
  locations: [
    { column: "address_line1",    label: "Street Address",    data_type: "text",    is_join: false },
    { column: "unit",             label: "Unit / Apt",        data_type: "text",    is_join: false },
    { column: "house_number",     label: "House Number",      data_type: "text",    is_join: false },
    { column: "street_name",      label: "Street Name",       data_type: "text",    is_join: false },
    { column: "street_suffix",    label: "Street Suffix",     data_type: "text",    is_join: false },
    { column: "city",             label: "City",              data_type: "text",    is_join: false },
    { column: "state",            label: "State",             data_type: "text",    is_join: false },
    { column: "postal_code",      label: "Zip Code",          data_type: "text",    is_join: false },
    { column: "zip",              label: "Zip (alt)",         data_type: "text",    is_join: false },
    { column: "council_district", label: "Council District",  data_type: "text",    is_join: false },
    { column: "subdivision",      label: "Subdivision",       data_type: "text",    is_join: false },
    { column: "land_use",         label: "Land Use",          data_type: "text",    is_join: false },
    { column: "type",             label: "Type",              data_type: "text",    is_join: false },
    { column: "common_place_name",label: "Common Place Name", data_type: "text",    is_join: false },
    { column: "place_name",       label: "Place Name",        data_type: "text",    is_join: false },
    { column: "postal_community", label: "Postal Community",  data_type: "text",    is_join: false },
    { column: "postal_city",      label: "Postal City",       data_type: "text",    is_join: false },
    { column: "parcel_id",        label: "Parcel ID",         data_type: "text",    is_join: false },
    { column: "pre_dir",          label: "Pre-Direction",     data_type: "text",    is_join: false },
    { column: "post_dir",         label: "Post-Direction",    data_type: "text",    is_join: false },
    { column: "is_residential",   label: "Is Residential",   data_type: "boolean", is_join: false },
  ],
};

function toLabel(col: string): string {
  return col
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(request: NextRequest) {
  const table = request.nextUrl.searchParams.get("table") as AllowedTable | null;

  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: "Invalid table. Must be one of: people, households, locations" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    // Graceful degradation — return hardcoded fallback
    return NextResponse.json(FALLBACK[table]);
  }

  try {
    // Query information_schema via the REST API (PostgREST exposes it with service role)
    const url = `${supabaseUrl}/rest/v1/rpc/get_table_columns`;

    // First try RPC approach, fallback to direct information_schema query
    const res = await fetch(
      `${supabaseUrl}/rest/v1/information_schema/columns?select=column_name,data_type&table_schema=eq.public&table_name=eq.${table}&order=ordinal_position`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json(FALLBACK[table]);
    }

    const cols: Array<{ column_name: string; data_type: string }> = await res.json();

    // Filter out excluded columns and FK columns (anything ending in _id)
    const filtered = cols.filter((c) => {
      if (EXCLUDED_COLS.has(c.column_name)) return false;
      if (c.column_name.endsWith("_id")) return false;
      return true;
    });

    const result: ColumnDef[] = filtered.map((c) => ({
      column: c.column_name,
      label: toLabel(c.column_name),
      data_type: c.data_type,
      is_join: false,
    }));

    // Append virtual location join fields for tables that need them
    if (table === "people" || table === "households") {
      // Add join fields only if not already present (avoid duplicates if table has city/state)
      const existingCols = new Set(result.map((r) => r.column));
      for (const jf of LOCATION_JOIN_FIELDS) {
        if (!existingCols.has(jf.column)) result.push(jf);
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK[table]);
  }
}
