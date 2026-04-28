import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type ColumnDef = {
  column: string;    // actual DB column name (or "votes_history.KEY" for JSONB sub-paths)
  label: string;     // display label
  data_type: string; // normalized type: "text", "boolean", "integer", "smallint", "date", "timestamp", "float", "text[]", "jsonb"
  is_join: boolean;  // true = resolved via join, not a direct column
  table?: "people" | "locations" | "households"; // which table this column belongs to
};

const ALLOWED_TABLES = ["people", "households", "locations", "companies", "opportunities"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

// Columns to always strip — system/FK/internal/geo/JSONB blobs
const EXCLUDED_COLS = new Set([
  // System / PKs
  "id", "tenant_id", "created_at", "updated_at", "synced_at",
  // FK fields that don't match the _id suffix regex (no trailing _id pattern)
  "employer",             // uuid FK in people (references companies)
  "contact_person_id",    // uuid FK in opportunities (contains underscore before _id)
  "customer_company_id",  // uuid FK in opportunities
  // Join/internal
  "normalized_key", "household_id", "location_id", "survey_id",
  "walklist_id", "person_id", "question_id", "crm_contact_id",
  "original_position", "order_index", "options",
  // JSONB blob columns — not directly importable; sub-paths handled via COMMON_FIELDS dot-notation
  "votes_history", "tags_json", "meta_json", "custom",
  // Geo (raw)
  "geom", "source",
  // Classification internals
  "classification_source", "classification_confidence", "classification_evidence",
  // Tracking
  "data_source", "data_updated_at",
  // Opportunity legacy/internal
  "legacy_order_code", "stop_id",
]);

// Normalize verbose Postgres data_type names to short canonical forms
function normalizeType(pgType: string, udtName?: string): string {
  if (pgType === "ARRAY") {
    // udt_name is prefixed with "_" for arrays: "_text" → "text[]"
    if (udtName?.startsWith("_")) return `${udtName.slice(1)}[]`;
    return "text[]";
  }
  const map: Record<string, string> = {
    "character varying": "text",
    "timestamp with time zone": "timestamp",
    "timestamp without time zone": "timestamp",
    "double precision": "float",
    "bigint": "integer",
    "USER-DEFINED": "text",
  };
  return map[pgType] ?? pgType;
}

// Virtual joined fields added for people (resolved via household → location joins in import)
const LOCATION_JOIN_FIELDS: ColumnDef[] = [
  // Geocoordinates
  { column: "lat",            label: "Geo: Latitude",           data_type: "float",    is_join: true, table: "locations" },
  { column: "lon",            label: "Geo: Longitude",          data_type: "float",    is_join: true, table: "locations" },
  // Address extras
  { column: "zip4",           label: "Zip+4 Extension",         data_type: "text",     is_join: true, table: "locations" },
  { column: "street_parity",  label: "Street Number Odd/Even",  data_type: "text",     is_join: true, table: "locations" },
  // Address
  { column: "address_line1",              label: "Street Address",             data_type: "text",    is_join: true, table: "locations" },
  { column: "city",                       label: "City",                       data_type: "text",    is_join: true, table: "locations" },
  { column: "state",                      label: "State",                      data_type: "text",    is_join: true, table: "locations" },
  { column: "postal_code",                label: "Zip Code",                   data_type: "text",    is_join: true, table: "locations" },
  // GIS address components
  { column: "house_number",               label: "House Number",               data_type: "text",    is_join: true, table: "locations" },
  { column: "pre_dir",                    label: "Pre-Directional",            data_type: "text",    is_join: true, table: "locations" },
  { column: "street_name",               label: "Street Name",                data_type: "text",    is_join: true, table: "locations" },
  { column: "street_suffix",             label: "Street Suffix",              data_type: "text",    is_join: true, table: "locations" },
  { column: "post_dir",                  label: "Post-Directional",           data_type: "text",    is_join: true, table: "locations" },
  { column: "postal_community",          label: "Postal Community",           data_type: "text",    is_join: true, table: "locations" },
  { column: "parcel_id",                 label: "Parcel ID / APN",            data_type: "text",    is_join: true, table: "locations" },
  { column: "subdivision",              label: "Subdivision",                data_type: "text",    is_join: true, table: "locations" },
  { column: "land_use",                 label: "Land Use",                   data_type: "text",    is_join: true, table: "locations" },
  // Districts
  { column: "congressional_district",    label: "Congressional District",     data_type: "text",    is_join: true, table: "locations" },
  { column: "state_senate_district",     label: "State Senate District",      data_type: "text",    is_join: true, table: "locations" },
  { column: "state_house_district",      label: "State House District",       data_type: "text",    is_join: true, table: "locations" },
  { column: "state_legislative_district",label: "State Legislative District", data_type: "text",    is_join: true, table: "locations" },
  { column: "precinct",                  label: "Precinct",                   data_type: "text",    is_join: true, table: "locations" },
  { column: "county_name",              label: "County",                     data_type: "text",    is_join: true, table: "locations" },
  { column: "municipality",             label: "Municipality",               data_type: "text",    is_join: true, table: "locations" },
  { column: "municipal_subdistrict",    label: "Municipal Subdistrict",      data_type: "text",    is_join: true, table: "locations" },
  { column: "county_commission_district",label: "County Commission District", data_type: "text",   is_join: true, table: "locations" },
  { column: "county_supervisor_district",label: "County Supervisor District", data_type: "text",   is_join: true, table: "locations" },
  { column: "school_district",          label: "School District",            data_type: "text",    is_join: true, table: "locations" },
  { column: "college_district",         label: "College District",           data_type: "text",    is_join: true, table: "locations" },
  { column: "judicial_district",        label: "Judicial District",          data_type: "text",    is_join: true, table: "locations" },
  { column: "fips_code",                label: "FIPS Code",                  data_type: "text",    is_join: true, table: "locations" },
  // Census / Geo
  { column: "urbanicity",               label: "Urbanicity",                 data_type: "text",    is_join: true, table: "locations" },
  { column: "population_density",       label: "Population Density",         data_type: "integer", is_join: true, table: "locations" },
  { column: "time_zone",                label: "Time Zone",                  data_type: "text",    is_join: true, table: "locations" },
  { column: "census_tract",             label: "Census Tract",               data_type: "text",    is_join: true, table: "locations" },
  { column: "census_block_group",       label: "Census Block Group",         data_type: "text",    is_join: true, table: "locations" },
  { column: "census_block",             label: "Census Block",               data_type: "text",    is_join: true, table: "locations" },
  { column: "dma",                      label: "DMA",                        data_type: "text",    is_join: true, table: "locations" },
  // Household composition
  { column: "total_persons",             label: "Total Persons",             data_type: "smallint",is_join: true, table: "households" },
  { column: "adults_count",              label: "Adults Count",              data_type: "smallint",is_join: true, table: "households" },
  { column: "children_count",            label: "Children Count",            data_type: "smallint",is_join: true, table: "households" },
  { column: "generations_count",         label: "Generations",               data_type: "smallint",is_join: true, table: "households" },
  { column: "household_voter_count",     label: "Voter Count",               data_type: "smallint",is_join: true, table: "households" },
  { column: "household_parties",         label: "Parties",                   data_type: "text",    is_join: true, table: "households" },
  { column: "head_of_household",         label: "Head of Household",         data_type: "text",    is_join: true, table: "households" },
  { column: "household_gender",          label: "Gender Composition",        data_type: "text",    is_join: true, table: "households" },
  { column: "has_senior",                label: "Has Senior",                data_type: "boolean", is_join: true, table: "households" },
  { column: "has_young_adult",           label: "Has Young Adult",           data_type: "boolean", is_join: true, table: "households" },
  { column: "has_children",             label: "Has Children",              data_type: "boolean", is_join: true, table: "households" },
  { column: "is_single_parent",          label: "Single Parent",             data_type: "boolean", is_join: true, table: "households" },
  { column: "has_disabled",             label: "Has Disabled",              data_type: "boolean", is_join: true, table: "households" },
  { column: "home_owner",               label: "Home Owner",                data_type: "boolean", is_join: true, table: "households" },
  { column: "home_estimated_value",     label: "Est. Home Value",           data_type: "integer", is_join: true, table: "households" },
  { column: "home_purchase_year",       label: "Home Purchase Year",        data_type: "smallint",is_join: true, table: "households" },
  { column: "home_dwelling_type",       label: "Dwelling Type",             data_type: "text",    is_join: true, table: "households" },
  { column: "home_sqft",               label: "Sq Ft",                     data_type: "integer", is_join: true, table: "households" },
  { column: "home_bedrooms",           label: "Bedrooms",                  data_type: "smallint",is_join: true, table: "households" },
];

// Hardcoded fallback used when service role key is missing or schema introspection fails.
// Must stay in sync with the actual DB schema — update when adding/removing columns.
const FALLBACK: Record<AllowedTable, ColumnDef[]> = {
  people: [
    // Identity
    { column: "title",              label: "Title (Mr./Mrs./Dr.)",           data_type: "text",     is_join: false },
    { column: "first_name",         label: "First Name",                     data_type: "text",     is_join: false },
    { column: "middle_name",        label: "Middle Name",                    data_type: "text",     is_join: false },
    { column: "middle_initial",     label: "Middle Initial",                 data_type: "text",     is_join: false },
    { column: "last_name",          label: "Last Name",                      data_type: "text",     is_join: false },
    { column: "suffix",             label: "Suffix (Jr./Sr./III)",           data_type: "text",     is_join: false },
    // Contact
    { column: "email",              label: "Email",                          data_type: "text",     is_join: false },
    { column: "email2",             label: "Email 2",                        data_type: "text",     is_join: false },
    { column: "email3",             label: "Email 3",                        data_type: "text",     is_join: false },
    { column: "phone",              label: "Phone (primary)",                data_type: "text",     is_join: false },
    { column: "phone2",             label: "Phone 2",                        data_type: "text",     is_join: false },
    { column: "phone3",             label: "Phone 3",                        data_type: "text",     is_join: false },
    { column: "phone_cell",         label: "Cell Phone",                     data_type: "text",     is_join: false },
    { column: "phone_landline",     label: "Landline",                       data_type: "text",     is_join: false },
    { column: "phone_cell_confidence", label: "Cell Phone Confidence",       data_type: "text",     is_join: false },
    { column: "do_not_call",        label: "Do Not Call",                    data_type: "boolean",  is_join: false },
    // Basic
    { column: "contact_type",       label: "Contact Type",                   data_type: "text",     is_join: false },
    { column: "occupation",         label: "Occupation",                     data_type: "text",     is_join: false },
    { column: "notes",              label: "Notes",                          data_type: "text",     is_join: false },
    { column: "active",             label: "Active",                         data_type: "boolean",  is_join: false },
    // Voter identity
    { column: "lalvoteid",          label: "LAL Voter ID",                   data_type: "text",     is_join: false },
    { column: "state_voter_id",     label: "State Voter ID",                 data_type: "text",     is_join: false },
    { column: "county_voter_id",    label: "County Voter ID",                data_type: "text",     is_join: false },
    // Demographics
    { column: "gender",             label: "Gender",                         data_type: "text",     is_join: false },
    { column: "birth_date",         label: "Birth Date",                     data_type: "date",     is_join: false },
    { column: "age",                label: "Age",                            data_type: "smallint", is_join: false },
    { column: "ethnicity",          label: "Ethnicity",                      data_type: "text",     is_join: false },
    { column: "ethnicity_source",   label: "Ethnicity Source",               data_type: "text",     is_join: false },
    { column: "hispanic_origin",    label: "Hispanic Origin",                data_type: "text",     is_join: false },
    { column: "language",           label: "Language",                       data_type: "text",     is_join: false },
    { column: "english_proficiency",label: "English Proficiency",            data_type: "text",     is_join: false },
    { column: "education_level",    label: "Education Level",                data_type: "text",     is_join: false },
    { column: "marital_status",     label: "Marital Status",                 data_type: "text",     is_join: false },
    { column: "religion",           label: "Religion",                       data_type: "text",     is_join: false },
    { column: "veteran",            label: "Veteran",                        data_type: "boolean",  is_join: false },
    { column: "place_of_birth",     label: "Place of Birth",                 data_type: "text",     is_join: false },
    // Party / Registration
    { column: "party",              label: "Party",                          data_type: "text",     is_join: false },
    { column: "party_switcher",     label: "Party Switcher",                 data_type: "boolean",  is_join: false },
    { column: "party_switch_type",  label: "Party Change (When)",            data_type: "text",     is_join: false },
    { column: "voter_status",       label: "Voter Status",                   data_type: "text",     is_join: false },
    { column: "registration_date",  label: "Registration Date",              data_type: "date",     is_join: false },
    { column: "permanent_absentee", label: "Permanent Absentee",             data_type: "boolean",  is_join: false },
    // Propensity scores
    { column: "likelihood_to_vote",         label: "Likelihood to Vote (0–100)",    data_type: "smallint", is_join: false },
    { column: "primary_likelihood",         label: "Primary Likelihood (0–100)",    data_type: "smallint", is_join: false },
    { column: "general_primary_likelihood", label: "General+Primary Likelihood",    data_type: "smallint", is_join: false },
    { column: "score_prog_dem",             label: "Score: Progressive Dem",        data_type: "smallint", is_join: false },
    { column: "score_mod_dem",              label: "Score: Moderate Dem",           data_type: "smallint", is_join: false },
    { column: "score_cons_rep",             label: "Score: Conservative Rep",       data_type: "smallint", is_join: false },
    { column: "score_mod_rep",              label: "Score: Moderate Rep",           data_type: "smallint", is_join: false },
    // Nolan Chart scores (from WSPQ quiz)
    { column: "nolan_personal_score",       label: "Nolan: Personal Freedom (0–100)", data_type: "smallint", is_join: false },
    { column: "nolan_economic_score",       label: "Nolan: Economic Freedom (0–100)", data_type: "smallint", is_join: false },
    // Voting turnout history (boolean — did they vote?)
    { column: "voting_frequency",   label: "Voting Frequency",               data_type: "text",     is_join: false },
    { column: "early_voter",        label: "Early Voter",                    data_type: "boolean",  is_join: false },
    { column: "absentee_type",      label: "Absentee Type",                  data_type: "text",     is_join: false },
    { column: "voted_general_2024", label: "Voted: General 2024",            data_type: "boolean",  is_join: false },
    { column: "voted_general_2022", label: "Voted: General 2022",            data_type: "boolean",  is_join: false },
    { column: "voted_general_2020", label: "Voted: General 2020",            data_type: "boolean",  is_join: false },
    { column: "voted_general_2018", label: "Voted: General 2018",            data_type: "boolean",  is_join: false },
    { column: "voted_primary_2024", label: "Voted: Primary 2024",            data_type: "boolean",  is_join: false },
    { column: "voted_primary_2022", label: "Voted: Primary 2022",            data_type: "boolean",  is_join: false },
    { column: "voted_primary_2020", label: "Voted: Primary 2020",            data_type: "boolean",  is_join: false },
    { column: "voted_primary_2018", label: "Voted: Primary 2018",            data_type: "boolean",  is_join: false },
    // Who they voted for (JSONB sub-paths — shown in survey builder COMMON_FIELDS, not directly importable)
    { column: "votes_history.2024_presidential_general", label: "2024 Pres. General — Who they voted for", data_type: "text", is_join: false },
    { column: "votes_history.2024_presidential_primary", label: "2024 Pres. Primary — Who they voted for", data_type: "text", is_join: false },
    { column: "votes_history.2020_presidential_general", label: "2020 Pres. General — Who they voted for", data_type: "text", is_join: false },
    { column: "votes_history.2020_presidential_primary", label: "2020 Pres. Primary — Who they voted for", data_type: "text", is_join: false },
    { column: "votes_history.2016_presidential_general", label: "2016 Pres. General — Who they voted for", data_type: "text", is_join: false },
    { column: "votes_history.2016_presidential_primary", label: "2016 Pres. Primary — Who they voted for", data_type: "text", is_join: false },
    // Political interests
    { column: "top_issues",         label: "Top Political Issues",           data_type: "text[]",   is_join: false },
    // Mailing address
    { column: "mailing_address",    label: "Mailing Address",                data_type: "text",     is_join: false },
    { column: "mailing_city",       label: "Mailing City",                   data_type: "text",     is_join: false },
    { column: "mailing_state",      label: "Mailing State",                  data_type: "text",     is_join: false },
    { column: "mailing_zip",        label: "Mailing Zip",                    data_type: "text",     is_join: false },
    // Professional / Financial
    { column: "occupation_title",   label: "Occupation Title",               data_type: "text",     is_join: false },
    { column: "company_name",       label: "Employer Name",                  data_type: "text",     is_join: false },
    { column: "income_range",       label: "Income Range",                   data_type: "text",     is_join: false },
    { column: "net_worth_range",    label: "Net Worth Range",                data_type: "text",     is_join: false },
    { column: "length_of_residence",label: "Length of Residence",            data_type: "text",     is_join: false },
    { column: "moved_from_state",   label: "Moved From State",               data_type: "text",     is_join: false },
    { column: "tags",               label: "Tags",                           data_type: "tag_array",         is_join: false },
    { column: "tp_created_at",      label: "Date Added to CRM",              data_type: "timestamp",         is_join: false },
    { column: "last_stop_date",     label: "Most Recent Stop",               data_type: "timestamp",         is_join: false },
    { column: "completed_survey",   label: "Completed Survey",               data_type: "survey_completion", is_join: false },
    ...LOCATION_JOIN_FIELDS,
  ],
  households: [
    { column: "name",                  label: "Household Name",     data_type: "text",     is_join: false },
    { column: "total_persons",         label: "Total Persons",      data_type: "smallint", is_join: false },
    { column: "adults_count",          label: "Adults Count",       data_type: "smallint", is_join: false },
    { column: "children_count",        label: "Children Count",     data_type: "smallint", is_join: false },
    { column: "generations_count",     label: "Generations",        data_type: "smallint", is_join: false },
    { column: "household_voter_count", label: "Voter Count",        data_type: "smallint", is_join: false },
    { column: "household_parties",     label: "Parties",            data_type: "text",     is_join: false },
    { column: "head_of_household",     label: "Head of Household",  data_type: "text",     is_join: false },
    { column: "household_gender",      label: "Gender Composition", data_type: "text",     is_join: false },
    { column: "has_senior",            label: "Has Senior",         data_type: "boolean",  is_join: false },
    { column: "has_young_adult",       label: "Has Young Adult",    data_type: "boolean",  is_join: false },
    { column: "has_children",          label: "Has Children",       data_type: "boolean",  is_join: false },
    { column: "is_single_parent",      label: "Single Parent",      data_type: "boolean",  is_join: false },
    { column: "has_disabled",          label: "Has Disabled",       data_type: "boolean",  is_join: false },
    { column: "home_owner",            label: "Home Owner",         data_type: "boolean",  is_join: false },
    { column: "home_estimated_value",  label: "Est. Home Value",    data_type: "integer",  is_join: false },
    { column: "home_purchase_year",    label: "Home Purchase Year", data_type: "smallint", is_join: false },
    { column: "home_dwelling_type",    label: "Dwelling Type",      data_type: "text",     is_join: false },
    { column: "home_sqft",             label: "Sq Ft",              data_type: "integer",  is_join: false },
    { column: "home_bedrooms",         label: "Bedrooms",           data_type: "smallint", is_join: false },
    ...LOCATION_JOIN_FIELDS.filter((f) => f.table === "locations"),
  ],
  companies: [
    { column: "name",     label: "Name",     data_type: "text", is_join: false },
    { column: "domain",   label: "Domain",   data_type: "text", is_join: false },
    { column: "phone",    label: "Phone",    data_type: "text", is_join: false },
    { column: "email",    label: "Email",    data_type: "text", is_join: false },
    { column: "industry", label: "Industry", data_type: "text", is_join: false },
    { column: "status",   label: "Status",   data_type: "text", is_join: false },
    { column: "presence", label: "Presence", data_type: "text", is_join: false },
  ],
  opportunities: [
    // Core
    { column: "title",             label: "Title",               data_type: "text",      is_join: false },
    { column: "stage",             label: "Stage",               data_type: "text",      is_join: false },
    { column: "pipeline",          label: "Pipeline",            data_type: "text",      is_join: false },
    { column: "priority",          label: "Priority",            data_type: "text",      is_join: false },
    { column: "source",            label: "Source",              data_type: "text",      is_join: false },
    { column: "channel",           label: "Channel",             data_type: "text",      is_join: false },
    { column: "amount_cents",      label: "Amount (cents)",      data_type: "integer",   is_join: false },
    // Dates
    { column: "order_date",        label: "Order Date",          data_type: "date",      is_join: false },
    { column: "delivery_date",     label: "Delivery Date",       data_type: "date",      is_join: false },
    { column: "due_at",            label: "Due At",              data_type: "timestamp", is_join: false },
    // Content
    { column: "description",       label: "Description",         data_type: "text",      is_join: false },
    { column: "notes",             label: "Notes",               data_type: "text",      is_join: false },
    { column: "message",           label: "Message",             data_type: "text",      is_join: false },
    { column: "delivery_location", label: "Delivery Location",   data_type: "text",      is_join: false },
    // Attribution
    { column: "how_heard",         label: "How They Heard",      data_type: "text",      is_join: false },
    { column: "referred_by",       label: "Referred By",         data_type: "text",      is_join: false },
    // Flags
    { column: "recurring",         label: "Recurring",           data_type: "boolean",   is_join: false },
    { column: "paid",              label: "Paid",                data_type: "boolean",   is_join: false },
    { column: "frequency",         label: "Frequency",           data_type: "text",      is_join: false },
  ],
  locations: [
    { column: "address_line1",     label: "Street Address",    data_type: "text",    is_join: false },
    { column: "unit",              label: "Unit / Apt",        data_type: "text",    is_join: false },
    { column: "house_number",      label: "House Number",      data_type: "text",    is_join: false },
    { column: "pre_dir",           label: "Pre-Direction",     data_type: "text",    is_join: false },
    { column: "street_name",       label: "Street Name",       data_type: "text",    is_join: false },
    { column: "street_suffix",     label: "Street Suffix",     data_type: "text",    is_join: false },
    { column: "post_dir",          label: "Post-Direction",    data_type: "text",    is_join: false },
    { column: "city",              label: "City",              data_type: "text",    is_join: false },
    { column: "state",             label: "State",             data_type: "text",    is_join: false },
    { column: "postal_code",       label: "Zip Code",          data_type: "text",    is_join: false },
    { column: "zip",               label: "Zip (alt)",         data_type: "text",    is_join: false },
    { column: "zip4",              label: "Zip+4",             data_type: "text",    is_join: false },
    { column: "postal_community",  label: "Postal Community",  data_type: "text",    is_join: false },
    { column: "postal_city",       label: "Postal City",       data_type: "text",    is_join: false },
    { column: "parcel_id",         label: "Parcel ID",         data_type: "text",    is_join: false },
    { column: "subdivision",       label: "Subdivision",       data_type: "text",    is_join: false },
    { column: "land_use",          label: "Land Use",          data_type: "text",    is_join: false },
    { column: "common_place_name", label: "Common Place Name", data_type: "text",    is_join: false },
    { column: "place_name",        label: "Place Name",        data_type: "text",    is_join: false },
    { column: "council_district",  label: "Council District",  data_type: "text",    is_join: false },
    { column: "type",              label: "Type",              data_type: "text",    is_join: false },
    { column: "is_residential",    label: "Is Residential",    data_type: "boolean", is_join: false },
    { column: "lat",               label: "Latitude",          data_type: "float",   is_join: false },
    { column: "lon",               label: "Longitude",         data_type: "float",   is_join: false },
    { column: "street_parity",     label: "Street Number Odd/Even", data_type: "text", is_join: false },
    { column: "source_row_id",     label: "Source Row ID",     data_type: "text",    is_join: false },
  ],
};

function toLabel(col: string): string {
  return col
    .replace(/_/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")  // "email2" → "email 2"
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(request: NextRequest) {
  const table = request.nextUrl.searchParams.get("table") as AllowedTable | null;

  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json(
      { error: "Invalid table. Must be one of: " + ALLOWED_TABLES.join(", ") },
      { status: 400 }
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json(FALLBACK[table]);
  }

  try {
    // Fetch column list from information_schema — include udt_name to resolve ARRAY element types
    const res = await fetch(
      `${supabaseUrl}/rest/v1/information_schema/columns?select=column_name,data_type,udt_name&table_schema=eq.public&table_name=eq.${table}&order=ordinal_position`,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) return NextResponse.json(FALLBACK[table]);

    const cols: Array<{ column_name: string; data_type: string; udt_name: string }> = await res.json();

    // Only match pure single-word _id suffix (household_id, location_id) but not compound FKs
    const FK_SUFFIX = /^[a-z]+_id$/;

    const filtered = cols.filter((c) => {
      if (EXCLUDED_COLS.has(c.column_name)) return false;
      if (FK_SUFFIX.test(c.column_name)) return false;
      // Skip raw uuid columns (FKs without _id suffix, e.g. employer)
      if (c.data_type === "uuid") return false;
      // Skip raw jsonb blob columns — sub-paths are handled via COMMON_FIELDS dot-notation
      if (c.data_type === "jsonb") return false;
      // Skip USER-DEFINED enum types that aren't text-compatible
      return true;
    });

    const result: ColumnDef[] = filtered.map((c) => ({
      column: c.column_name,
      label: toLabel(c.column_name),
      data_type: normalizeType(c.data_type, c.udt_name),
      is_join: false,
      table: table as "people" | "locations" | "households" | undefined,
    }));

    // Append virtual location/household join fields for tables that support them
    if (table === "people" || table === "households") {
      const existingCols = new Set(result.map((r) => r.column));
      for (const jf of LOCATION_JOIN_FIELDS) {
        if (!existingCols.has(jf.column)) result.push(jf);
      }
    }

    // Inject votes_history sub-path entries for people (not in direct schema, handled via FALLBACK dot-paths)
    if (table === "people") {
      const existingCols = new Set(result.map((r) => r.column));
      const dotPaths = FALLBACK.people.filter((f) => f.column.startsWith("votes_history."));
      for (const dp of dotPaths) {
        if (!existingCols.has(dp.column)) result.push(dp);
      }
      // Inject virtual fields stored on tenant_people or survey_sessions, handled specially in search
      if (!existingCols.has("tags"))
        result.push({ column: "tags",             label: "Tags",                  data_type: "tag_array",         is_join: false });
      if (!existingCols.has("tp_created_at"))
        result.push({ column: "tp_created_at",    label: "Date Added to CRM",     data_type: "timestamp",         is_join: false });
      if (!existingCols.has("last_stop_date"))
        result.push({ column: "last_stop_date",   label: "Most Recent Stop",      data_type: "timestamp",         is_join: false });
      if (!existingCols.has("completed_survey"))
        result.push({ column: "completed_survey", label: "Completed Survey",      data_type: "survey_completion", is_join: false });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK[table]);
  }
}
