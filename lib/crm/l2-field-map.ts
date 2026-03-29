// lib/crm/l2-field-map.ts
// Maps L2 Political voter file CSV header names (lowercased + underscored) to
// destination table and column. Used by ImportPanel autoDetect() and by the
// import route for type coercion.
//
// ⚠ L2 header names are speculative — update once a real sample file is on hand.
// Unmapped headers fall through to meta_json automatically (no code change needed).

export type L2Dest = "people" | "households" | "locations" | "meta";

export type L2FieldDef = {
  dest: L2Dest;
  column: string;
  transform?: "boolean" | "integer" | "smallint" | "date" | "float";
};

/** Keyed by lowercased, underscore-normalized CSV header name. */
export const L2_FIELD_MAP: Record<string, L2FieldDef> = {
  // ── People: core voter identity ────────────────────────────────────────────
  voter_id:                      { dest: "people", column: "state_voter_id" },
  registered_party:              { dest: "people", column: "party" },
  age:                           { dest: "people", column: "age",            transform: "smallint" },
  lalvoterid:                    { dest: "people", column: "lalvoteid" },
  voters_lalvoterid:             { dest: "people", column: "lalvoteid" },
  voters_statefileid:            { dest: "people", column: "state_voter_id" },
  state_voter_id:                { dest: "people", column: "state_voter_id" },
  voters_countyfileid:           { dest: "people", column: "county_voter_id" },
  county_voter_id:               { dest: "people", column: "county_voter_id" },
  voters_firstname:              { dest: "people", column: "first_name" },
  voters_lastname:               { dest: "people", column: "last_name" },
  voters_middlename:             { dest: "meta",   column: "middle_name" },
  voters_namesuffix:             { dest: "meta",   column: "name_suffix" },
  voters_gender:                 { dest: "people", column: "gender" },
  gender:                        { dest: "people", column: "gender" },
  voters_birthdate:              { dest: "people", column: "birth_date",  transform: "date" },
  birth_date:                    { dest: "people", column: "birth_date",  transform: "date" },
  dob:                           { dest: "people", column: "birth_date",  transform: "date" },
  date_of_birth:                 { dest: "people", column: "birth_date",  transform: "date" },
  voters_age:                    { dest: "people", column: "age",          transform: "smallint" },
  voters_regstatusdate:          { dest: "people", column: "registration_date", transform: "date" },
  voters_registrationdate:       { dest: "people", column: "registration_date", transform: "date" },
  registration_date:             { dest: "people", column: "registration_date", transform: "date" },
  voter_status:                  { dest: "people", column: "voter_status" },
  voter_status_desc:             { dest: "people", column: "voter_status" },
  voters_voterstatus:            { dest: "people", column: "voter_status" },
  voters_permanentabsenteeindicator: { dest: "people", column: "permanent_absentee", transform: "boolean" },
  permanent_absentee:            { dest: "people", column: "permanent_absentee", transform: "boolean" },
  veterans_flag:                 { dest: "people", column: "veteran",      transform: "boolean" },
  veteran:                       { dest: "people", column: "veteran",      transform: "boolean" },
  do_not_call:                   { dest: "people", column: "do_not_call",  transform: "boolean" },
  dnc_flag:                      { dest: "people", column: "do_not_call",  transform: "boolean" },
  place_of_birth:                { dest: "people", column: "place_of_birth" },
  voters_placeofbirth:           { dest: "people", column: "place_of_birth" },
  mailing_address:               { dest: "people", column: "mailing_address" },
  voters_mailingaddress:         { dest: "people", column: "mailing_address" },

  // ── People: propensity scores ──────────────────────────────────────────────
  likelihood_to_vote:                              { dest: "people", column: "likelihood_to_vote",         transform: "smallint" },
  primary_likelihood_to_vote:                      { dest: "people", column: "primary_likelihood",         transform: "smallint" },
  combined_general_and_primary_likelihood_to_vote: { dest: "people", column: "general_primary_likelihood", transform: "smallint" },

  // ── People: phones ─────────────────────────────────────────────────────────
  votertelephones_landlineformatted: { dest: "people", column: "phone_landline" },
  votertelephones_landline:      { dest: "people", column: "phone_landline" },
  phone_landline:                { dest: "people", column: "phone_landline" },
  landline:                      { dest: "people", column: "phone_landline" },
  votertelephones_cell:          { dest: "people", column: "phone_cell" },
  phone_cell:                    { dest: "people", column: "phone_cell" },
  cell_phone:                    { dest: "people", column: "phone_cell" },
  cell:                          { dest: "people", column: "phone_cell" },
  cell_phone_confidence_code:    { dest: "people", column: "phone_cell_confidence" },

  // ── People: party ──────────────────────────────────────────────────────────
  parties_description:           { dest: "people", column: "party" },
  voter_party:                   { dest: "people", column: "party" },
  party_affil:                   { dest: "people", column: "party" },
  party_description:             { dest: "people", column: "party" },
  party_switcher:                { dest: "people", column: "party_switcher", transform: "boolean" },
  voters_partyswitcher:          { dest: "people", column: "party_switcher", transform: "boolean" },
  // "Within Last 1 Year" style text — store as text, not boolean
  "voter_changed_party?":        { dest: "people", column: "party_switch_type" },

  // ── People: political scores ───────────────────────────────────────────────
  score_prog_dem:                { dest: "people", column: "score_prog_dem", transform: "smallint" },
  progressive_dem_score:         { dest: "people", column: "score_prog_dem", transform: "smallint" },
  score_mod_dem:                 { dest: "people", column: "score_mod_dem",  transform: "smallint" },
  moderate_dem_score:            { dest: "people", column: "score_mod_dem",  transform: "smallint" },
  score_cons_rep:                { dest: "people", column: "score_cons_rep", transform: "smallint" },
  conservative_rep_score:        { dest: "people", column: "score_cons_rep", transform: "smallint" },
  score_mod_rep:                 { dest: "people", column: "score_mod_rep",  transform: "smallint" },
  moderate_rep_score:            { dest: "people", column: "score_mod_rep",  transform: "smallint" },

  // ── People: per-election voting history ────────────────────────────────────
  // L2_FIELD_MAP is checked BEFORE the year regex in autoDetect, so these won't
  // be misidentified as giving cycles.
  general_2024:          { dest: "people", column: "voted_general_2024", transform: "boolean" },
  voted_in_2022:         { dest: "people", column: "voted_general_2022", transform: "boolean" },
  voted_in_2020:         { dest: "people", column: "voted_general_2020", transform: "boolean" },
  voted_in_2018:         { dest: "people", column: "voted_general_2018", transform: "boolean" },
  primary_2024:          { dest: "people", column: "voted_primary_2024", transform: "boolean" },
  voted_in_2022_primary: { dest: "people", column: "voted_primary_2022", transform: "boolean" },
  voter_in_2020_primary: { dest: "people", column: "voted_primary_2020", transform: "boolean" },
  voted_in_2018_primary: { dest: "people", column: "voted_primary_2018", transform: "boolean" },

  // ── People: voting history ─────────────────────────────────────────────────
  voting_frequency:              { dest: "people", column: "voting_frequency" },
  voters_votingfrequency:        { dest: "people", column: "voting_frequency" },
  vote_frequency:                { dest: "people", column: "voting_frequency" },
  early_voter:                   { dest: "people", column: "early_voter",    transform: "boolean" },
  voters_earlyvoter:             { dest: "people", column: "early_voter",    transform: "boolean" },
  absentee_type:                 { dest: "people", column: "absentee_type" },
  voters_absenteetype:           { dest: "people", column: "absentee_type" },

  // ── People: mailing address components ────────────────────────────────────
  mailing_city:          { dest: "people", column: "mailing_city" },
  mailing_state:         { dest: "people", column: "mailing_state" },
  mailing_zip:           { dest: "people", column: "mailing_zip" },

  // ── People: demographics ───────────────────────────────────────────────────
  ethnicgroups_ethnicgroup1desc: { dest: "people", column: "ethnicity" },
  ethnicgroups_ethnicdescription:{ dest: "people", column: "ethnicity" },
  ethnicity:                     { dest: "people", column: "ethnicity" },
  ethnic_group:                  { dest: "people", column: "ethnicity" },
  ethnicity_source:              { dest: "people", column: "ethnicity_source" },
  hispanic_origin:               { dest: "people", column: "hispanic_origin" },
  languages_description:         { dest: "people", column: "language" },
  language:                      { dest: "people", column: "language" },
  spoken_language:               { dest: "people", column: "language" },
  english_proficiency:           { dest: "people", column: "english_proficiency" },
  education_description:         { dest: "people", column: "education_level" },
  education_level:               { dest: "people", column: "education_level" },
  maritalstatus_description:     { dest: "people", column: "marital_status" },
  marital_status:                { dest: "people", column: "marital_status" },
  religion_description:          { dest: "people", column: "religion" },
  religion:                      { dest: "people", column: "religion" },

  // ── People: professional ───────────────────────────────────────────────────
  occupation_description:        { dest: "people", column: "occupation_title" },
  occupation_title:              { dest: "people", column: "occupation_title" },
  commercialdata_employername:   { dest: "people", column: "company_name" },
  company_name:                  { dest: "people", column: "company_name" },
  employer_name:                 { dest: "people", column: "company_name" },

  // ── People: financial ──────────────────────────────────────────────────────
  commercialdata_estimatedincome:{ dest: "people", column: "income_range" },
  income_range:                  { dest: "people", column: "income_range" },
  estimated_income:              { dest: "people", column: "income_range" },
  commercialdata_networth:       { dest: "people", column: "net_worth_range" },
  net_worth_range:               { dest: "people", column: "net_worth_range" },
  net_worth:                     { dest: "people", column: "net_worth_range" },

  // ── People: military ───────────────────────────────────────────────────────
  "military_active/veteran":     { dest: "people", column: "veteran",      transform: "boolean" },

  // ── People: mover ──────────────────────────────────────────────────────────
  commercialdata_lengthofresidence: { dest: "people", column: "length_of_residence" },
  length_of_residence:           { dest: "people", column: "length_of_residence" },
  moved_from_state:              { dest: "people", column: "moved_from_state" },
  voters_movedfromstate:         { dest: "people", column: "moved_from_state" },

  // ── Locations: geocoordinates ─────────────────────────────────────────────
  lattitude:             { dest: "locations", column: "lat", transform: "float" },  // vendor typo
  latitude:              { dest: "locations", column: "lat", transform: "float" },
  longitude:             { dest: "locations", column: "lon", transform: "float" },

  // ── Locations: address ─────────────────────────────────────────────────────
  second_address_line:   { dest: "locations", column: "unit" },
  "zip+4":               { dest: "locations", column: "zip4" },
  "street_number_odd/even": { dest: "locations", column: "street_parity" },
  residence_addresses_addressline: { dest: "locations", column: "address_line1" },
  residence_addresses_city:      { dest: "locations", column: "city" },
  residence_addresses_state:     { dest: "locations", column: "state" },
  residence_addresses_zip:       { dest: "locations", column: "postal_code" },
  residence_addresses_zip5:      { dest: "locations", column: "postal_code" },

  // ── Locations: districts ───────────────────────────────────────────────────
  us_congressional_district:     { dest: "locations", column: "congressional_district" },
  us_congressionaldistrict_description: { dest: "locations", column: "congressional_district" },
  congressional_district:        { dest: "locations", column: "congressional_district" },
  state_senate_district:         { dest: "locations", column: "state_senate_district" },
  state_senate_description:      { dest: "locations", column: "state_senate_district" },
  state_house_district:          { dest: "locations", column: "state_house_district" },
  state_house_description:       { dest: "locations", column: "state_house_district" },
  state_legislative_district:    { dest: "locations", column: "state_legislative_district" },
  precinct_code:                 { dest: "locations", column: "precinct" },
  precinct:                      { dest: "locations", column: "precinct" },
  county_name:                   { dest: "locations", column: "county_name" },
  voters_fips:                   { dest: "locations", column: "fips_code" },
  fips_code:                     { dest: "locations", column: "fips_code" },
  municipality:                  { dest: "locations", column: "municipality" },
  municipal_subdistrict:         { dest: "locations", column: "municipal_subdistrict" },
  county_commission_district:    { dest: "locations", column: "county_commission_district" },
  county_supervisor_district:    { dest: "locations", column: "county_supervisor_district" },
  school_district:               { dest: "locations", column: "school_district" },
  college_district:              { dest: "locations", column: "college_district" },
  judicial_district:             { dest: "locations", column: "judicial_district" },

  // ── Locations: geo / census ────────────────────────────────────────────────
  time_zone:                     { dest: "locations", column: "time_zone" },
  urbanicity:                    { dest: "locations", column: "urbanicity" },
  population_density:            { dest: "locations", column: "population_density", transform: "integer" },
  census_tract:                  { dest: "locations", column: "census_tract" },
  census_block_group:            { dest: "locations", column: "census_block_group" },
  census_block:                  { dest: "locations", column: "census_block" },
  dma:                           { dest: "locations", column: "dma" },
  dma_name:                      { dest: "locations", column: "dma" },

  // ── Households ─────────────────────────────────────────────────────────────
  apartment_type:                       { dest: "households", column: "home_dwelling_type" },
  household_party_registration:         { dest: "households", column: "household_parties" },
  mailing_household_size:               { dest: "households", column: "total_persons",    transform: "smallint" },
  mailing_household_party_registration: { dest: "households", column: "household_parties" },
  total_persons:                 { dest: "households", column: "total_persons",    transform: "smallint" },
  household_total:               { dest: "households", column: "total_persons",    transform: "smallint" },
  adults_count:                  { dest: "households", column: "adults_count",     transform: "smallint" },
  children_count:                { dest: "households", column: "children_count",   transform: "smallint" },
  generations_count:             { dest: "households", column: "generations_count",transform: "smallint" },
  has_senior:                    { dest: "households", column: "has_senior",       transform: "boolean" },
  has_young_adult:               { dest: "households", column: "has_young_adult",  transform: "boolean" },
  has_children:                  { dest: "households", column: "has_children",     transform: "boolean" },
  is_single_parent:              { dest: "households", column: "is_single_parent", transform: "boolean" },
  has_disabled:                  { dest: "households", column: "has_disabled",     transform: "boolean" },
  household_voter_count:         { dest: "households", column: "household_voter_count", transform: "smallint" },
  household_parties:             { dest: "households", column: "household_parties" },
  head_of_household:             { dest: "households", column: "head_of_household" },
  household_gender:              { dest: "households", column: "household_gender" },
  home_owner:                    { dest: "households", column: "home_owner",       transform: "boolean" },
  homeowner_flag:                { dest: "households", column: "home_owner",       transform: "boolean" },
  home_estimated_value:          { dest: "households", column: "home_estimated_value", transform: "integer" },
  estimated_home_value:          { dest: "households", column: "home_estimated_value", transform: "integer" },
  home_purchase_year:            { dest: "households", column: "home_purchase_year", transform: "smallint" },
  home_dwelling_type:            { dest: "households", column: "home_dwelling_type" },
  dwelling_type:                 { dest: "households", column: "home_dwelling_type" },
  home_sqft:                     { dest: "households", column: "home_sqft",        transform: "integer" },
  home_bedrooms:                 { dest: "households", column: "home_bedrooms",    transform: "smallint" },
};

// ── Type coercion sets (used by import route) ──────────────────────────────

export const L2_BOOLEAN_COLS = new Set([
  "party_switcher", "permanent_absentee", "veteran", "do_not_call",
  "early_voter",
  // per-election voting history
  "voted_general_2024", "voted_general_2022", "voted_general_2020", "voted_general_2018",
  "voted_primary_2024", "voted_primary_2022", "voted_primary_2020", "voted_primary_2018",
  // households
  "has_senior", "has_young_adult", "has_children", "is_single_parent",
  "has_disabled", "home_owner",
]);

export const L2_INTEGER_COLS = new Set([
  "home_estimated_value", "home_sqft", "population_density",
]);

export const L2_SMALLINT_COLS = new Set([
  "age", "score_prog_dem", "score_mod_dem", "score_cons_rep", "score_mod_rep",
  "likelihood_to_vote", "primary_likelihood", "general_primary_likelihood",
  "total_persons", "adults_count", "children_count", "generations_count",
  "household_voter_count", "home_purchase_year", "home_bedrooms",
]);

export const L2_DATE_COLS = new Set([
  "birth_date", "registration_date",
]);

export const L2_FLOAT_COLS = new Set(["lat", "lon"]);

/** Coerce a raw string value to the correct DB type for a given L2 column. */
export function applyL2Transform(raw: string, column: string): unknown {
  const v = (raw ?? "").trim();
  if (!v) return null;

  if (L2_BOOLEAN_COLS.has(column)) {
    const lc = v.toLowerCase();
    return lc === "true" || lc === "yes" || lc === "1" || lc === "y" || lc === "t";
  }
  if (L2_INTEGER_COLS.has(column) || L2_SMALLINT_COLS.has(column)) {
    const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
    return isNaN(n) ? null : n;
  }
  if (L2_DATE_COLS.has(column)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  if (L2_FLOAT_COLS.has(column)) {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // voter_status normalization: "A" → "Active", "I" → "Inactive"
  if (column === "voter_status") {
    if (v === "A") return "Active";
    if (v === "I") return "Inactive";
  }

  return v || null;
}

// ── Column sets per destination table (used by import route) ───────────────

export const PEOPLE_L2_COLS = new Set([
  "lalvoteid", "state_voter_id", "county_voter_id", "gender", "birth_date",
  "age", "party", "party_switcher", "party_switch_type", "voter_status", "registration_date",
  "permanent_absentee", "veteran", "do_not_call", "place_of_birth",
  "phone_cell", "phone_landline", "phone_cell_confidence", "mailing_address",
  "mailing_city", "mailing_state", "mailing_zip",
  "score_prog_dem", "score_mod_dem", "score_cons_rep", "score_mod_rep",
  "likelihood_to_vote", "primary_likelihood", "general_primary_likelihood",
  "voting_frequency", "early_voter", "absentee_type",
  "voted_general_2024", "voted_general_2022", "voted_general_2020", "voted_general_2018",
  "voted_primary_2024", "voted_primary_2022", "voted_primary_2020", "voted_primary_2018",
  "ethnicity", "ethnicity_source", "hispanic_origin", "language",
  "english_proficiency", "education_level", "marital_status", "religion",
  "occupation_title", "company_name", "income_range", "net_worth_range",
  "length_of_residence", "moved_from_state",
]);

export const HOUSEHOLD_L2_COLS = new Set([
  "total_persons", "adults_count", "children_count", "generations_count",
  "has_senior", "has_young_adult", "has_children", "is_single_parent",
  "has_disabled", "household_voter_count", "household_parties",
  "head_of_household", "household_gender", "home_owner",
  "home_estimated_value", "home_purchase_year", "home_dwelling_type",
  "home_sqft", "home_bedrooms",
]);

export const LOCATION_L2_COLS = new Set([
  // GIS address components (stored alongside address_line1)
  "house_number", "pre_dir", "street_name", "street_suffix", "post_dir",
  "unit", "parcel_id", "postal_community", "full_address", "source_row_id",
  "zip4", "street_parity",
  // geocoordinates (imported from vendor file → no geocoding pass needed)
  "lat", "lon",
  // L2 districts + geo
  "congressional_district", "state_house_district", "state_senate_district",
  "state_legislative_district", "county_name", "fips_code", "precinct",
  "municipality", "municipal_subdistrict", "county_commission_district",
  "county_supervisor_district", "school_district", "college_district",
  "judicial_district", "time_zone", "urbanicity", "population_density",
  "census_tract", "census_block_group", "census_block", "dma",
]);
