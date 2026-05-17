import { createClient } from "@supabase/supabase-js";

export type RecordType =
  | "people"
  | "companies"
  | "households"
  | "locations"
  | "opportunities"
  | "sitrep_items";

export type StandardField = {
  key: string;
  defaultLabel: string;
  advanced?: boolean;
};

export const STANDARD_FIELDS: Record<RecordType, StandardField[]> = {
  people: [
    { key: "first_name",                defaultLabel: "First Name" },
    { key: "last_name",                 defaultLabel: "Last Name" },
    { key: "email",                     defaultLabel: "Email" },
    { key: "phone",                     defaultLabel: "Phone" },
    { key: "notes",                     defaultLabel: "Notes" },
    { key: "title",                     defaultLabel: "Title" },
    { key: "suffix",                    defaultLabel: "Suffix" },
    { key: "middle_name",               defaultLabel: "Middle Name" },
    { key: "phone_cell",                defaultLabel: "Cell Phone" },
    { key: "phone_landline",            defaultLabel: "Landline" },
    { key: "gender",                    defaultLabel: "Gender" },
    { key: "birth_date",                defaultLabel: "Birth Date" },
    { key: "age",                       defaultLabel: "Age" },
    { key: "party",                     defaultLabel: "Party" },
    { key: "voter_status",              defaultLabel: "Voter Status" },
    { key: "registration_date",         defaultLabel: "Registration Date" },
    { key: "do_not_call",               defaultLabel: "Do Not Call" },
    { key: "veteran",                   defaultLabel: "Veteran" },
    { key: "occupation",                defaultLabel: "Occupation" },
    { key: "occupation_title",          defaultLabel: "Job Title" },
    { key: "company_name",              defaultLabel: "Employer" },
    { key: "income_range",              defaultLabel: "Income Range" },
    { key: "ethnicity",                 defaultLabel: "Ethnicity" },
    { key: "language",                  defaultLabel: "Language" },
    { key: "education_level",           defaultLabel: "Education Level" },
    { key: "marital_status",            defaultLabel: "Marital Status" },
    { key: "mailing_address",           defaultLabel: "Mailing Address" },
    // Advanced
    { key: "middle_initial",            defaultLabel: "Middle Initial",              advanced: true },
    { key: "place_of_birth",            defaultLabel: "Place of Birth",              advanced: true },
    { key: "religion",                  defaultLabel: "Religion",                    advanced: true },
    { key: "hispanic_origin",           defaultLabel: "Hispanic Origin",             advanced: true },
    { key: "english_proficiency",       defaultLabel: "English Proficiency",         advanced: true },
    { key: "net_worth_range",           defaultLabel: "Net Worth Range",             advanced: true },
    { key: "length_of_residence",       defaultLabel: "Length of Residence",         advanced: true },
    { key: "moved_from_state",          defaultLabel: "Moved From State",            advanced: true },
    { key: "mailing_city",              defaultLabel: "Mailing City",                advanced: true },
    { key: "mailing_state",             defaultLabel: "Mailing State",               advanced: true },
    { key: "mailing_zip",               defaultLabel: "Mailing ZIP",                 advanced: true },
    { key: "permanent_absentee",        defaultLabel: "Permanent Absentee",          advanced: true },
    { key: "absentee_type",             defaultLabel: "Absentee Type",               advanced: true },
    { key: "early_voter",               defaultLabel: "Early Voter",                 advanced: true },
    { key: "voting_frequency",          defaultLabel: "Voting Frequency",            advanced: true },
    { key: "likelihood_to_vote",        defaultLabel: "Likelihood to Vote",          advanced: true },
    { key: "primary_likelihood",        defaultLabel: "Primary Likelihood",          advanced: true },
    { key: "general_primary_likelihood",defaultLabel: "General Primary Likelihood",  advanced: true },
    { key: "score_prog_dem",            defaultLabel: "Progressive Dem Score",       advanced: true },
    { key: "score_mod_dem",             defaultLabel: "Moderate Dem Score",          advanced: true },
    { key: "score_cons_rep",            defaultLabel: "Conservative Rep Score",      advanced: true },
    { key: "score_mod_rep",             defaultLabel: "Moderate Rep Score",          advanced: true },
    { key: "top_issues",                defaultLabel: "Top Issues",                  advanced: true },
    { key: "lalvoteid",                 defaultLabel: "State Voter File ID",         advanced: true },
    { key: "state_voter_id",            defaultLabel: "State Voter ID",              advanced: true },
    { key: "county_voter_id",           defaultLabel: "County Voter ID",             advanced: true },
    { key: "phone_cell_confidence",     defaultLabel: "Cell Confidence",             advanced: true },
    { key: "voted_general_2024",        defaultLabel: "Voted General 2024",          advanced: true },
    { key: "voted_general_2022",        defaultLabel: "Voted General 2022",          advanced: true },
    { key: "voted_general_2020",        defaultLabel: "Voted General 2020",          advanced: true },
    { key: "voted_general_2018",        defaultLabel: "Voted General 2018",          advanced: true },
    { key: "voted_primary_2024",        defaultLabel: "Voted Primary 2024",          advanced: true },
    { key: "voted_primary_2022",        defaultLabel: "Voted Primary 2022",          advanced: true },
    { key: "voted_primary_2020",        defaultLabel: "Voted Primary 2020",          advanced: true },
    { key: "voted_primary_2018",        defaultLabel: "Voted Primary 2018",          advanced: true },
    { key: "votes_history",             defaultLabel: "Votes History",               advanced: true },
  ],

  companies: [
    { key: "name",       defaultLabel: "Company Name" },
    { key: "industry",   defaultLabel: "Industry" },
    { key: "website",    defaultLabel: "Website" },
    { key: "phone",      defaultLabel: "Phone" },
    { key: "email",      defaultLabel: "Email" },
    { key: "notes",      defaultLabel: "Notes" },
  ],

  households: [
    { key: "name",  defaultLabel: "Household Name" },
    { key: "notes", defaultLabel: "Notes" },
  ],

  locations: [
    { key: "place_name",                defaultLabel: "Name / Place Name" },
    { key: "notes",                     defaultLabel: "Notes" },
    { key: "address_line1",             defaultLabel: "Street Address" },
    { key: "unit",                      defaultLabel: "Unit / Apt" },
    { key: "city",                      defaultLabel: "City" },
    { key: "state",                     defaultLabel: "State" },
    { key: "postal_code",               defaultLabel: "ZIP Code" },
    // Advanced
    { key: "house_number",              defaultLabel: "House Number",                advanced: true },
    { key: "pre_dir",                   defaultLabel: "Pre-Direction",               advanced: true },
    { key: "street_name",               defaultLabel: "Street Name",                 advanced: true },
    { key: "street_suffix",             defaultLabel: "Street Suffix",               advanced: true },
    { key: "post_dir",                  defaultLabel: "Post-Direction",              advanced: true },
    { key: "zip4",                      defaultLabel: "ZIP+4",                       advanced: true },
    { key: "parcel_id",                 defaultLabel: "Parcel ID",                   advanced: true },
    { key: "land_use",                  defaultLabel: "Land Use",                    advanced: true },
    { key: "council_district",          defaultLabel: "Council District",            advanced: true },
    { key: "subdivision",               defaultLabel: "Subdivision",                 advanced: true },
    { key: "type",                      defaultLabel: "Location Type",               advanced: true },
    { key: "common_place_name",         defaultLabel: "Common Place Name",           advanced: true },
    { key: "lat",                       defaultLabel: "Latitude",                    advanced: true },
    { key: "lon",                       defaultLabel: "Longitude",                   advanced: true },
    { key: "congressional_district",    defaultLabel: "Congressional District",      advanced: true },
    { key: "state_senate_district",     defaultLabel: "State Senate District",       advanced: true },
    { key: "state_house_district",      defaultLabel: "State House District",        advanced: true },
    { key: "state_legislative_district",defaultLabel: "State Legislative District",  advanced: true },
    { key: "precinct",                  defaultLabel: "Precinct",                    advanced: true },
    { key: "county_name",               defaultLabel: "County",                      advanced: true },
    { key: "municipality",              defaultLabel: "Municipality",                advanced: true },
    { key: "municipal_subdistrict",     defaultLabel: "Municipal Subdistrict",       advanced: true },
    { key: "county_commission_district",defaultLabel: "County Commission District",  advanced: true },
    { key: "county_supervisor_district",defaultLabel: "County Supervisor District",  advanced: true },
    { key: "school_district",           defaultLabel: "School District",             advanced: true },
    { key: "college_district",          defaultLabel: "College District",            advanced: true },
    { key: "judicial_district",         defaultLabel: "Judicial District",           advanced: true },
    { key: "fips_code",                 defaultLabel: "FIPS Code",                   advanced: true },
    { key: "census_tract",              defaultLabel: "Census Tract",                advanced: true },
    { key: "census_block_group",        defaultLabel: "Census Block Group",          advanced: true },
    { key: "census_block",              defaultLabel: "Census Block",                advanced: true },
    { key: "dma",                       defaultLabel: "DMA",                         advanced: true },
    { key: "urbanicity",                defaultLabel: "Urbanicity",                  advanced: true },
    { key: "population_density",        defaultLabel: "Population Density",          advanced: true },
    { key: "time_zone",                 defaultLabel: "Time Zone",                   advanced: true },
  ],

  opportunities: [
    { key: "title",       defaultLabel: "Title" },
    { key: "stage",       defaultLabel: "Stage" },
    { key: "amount_cents",defaultLabel: "Amount" },
    { key: "description", defaultLabel: "Description" },
    { key: "notes",       defaultLabel: "Notes" },
    { key: "priority",    defaultLabel: "Priority" },
    { key: "due_at",      defaultLabel: "Due Date" },
    { key: "source",      defaultLabel: "Source" },
    { key: "pipeline",    defaultLabel: "Pipeline" },
  ],

  sitrep_items: [
    { key: "title",        defaultLabel: "Title" },
    { key: "description",  defaultLabel: "Description" },
    { key: "status",       defaultLabel: "Status" },
    { key: "priority",     defaultLabel: "Priority" },
    { key: "item_type",    defaultLabel: "Type" },
    { key: "due_date",     defaultLabel: "Due Date" },
    { key: "visibility",   defaultLabel: "Visibility" },
    { key: "location_id",  defaultLabel: "Location" },
    { key: "meeting_url",  defaultLabel: "Meeting URL" },
    // Advanced
    { key: "start_at",     defaultLabel: "Start Time",    advanced: true },
    { key: "end_at",       defaultLabel: "End Time",      advanced: true },
    { key: "is_all_day",   defaultLabel: "All Day",       advanced: true },
    { key: "agenda",       defaultLabel: "Agenda",        advanced: true },
    { key: "meeting_notes",defaultLabel: "Meeting Notes", advanced: true },
    { key: "is_recurring", defaultLabel: "Recurring",     advanced: true },
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
