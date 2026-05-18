// Shared field registry for survey export / column picker.
// Single source of truth for what extra columns can be added to survey results.

export type FieldSource =
  | "people"         // direct column on people table
  | "votes_history"  // JSONB sub-key from people.votes_history
  | "tenant_people"  // column on tenant_people junction (key has "tp." prefix)
  | "households"     // column on households table (key has "hh." prefix)
  | "locations";     // column on locations table (key has "loc." prefix)

export interface ExportFieldDef {
  key: string;       // API param value; prefixed keys for non-people tables
  label: string;     // display label
  source: FieldSource;
  group: string;
}

export const SURVEY_EXPORT_FIELDS: ExportFieldDef[] = [
  // ── Voter Data ────────────────────────────────────────────────────────────
  { key: "party",                          label: "Party",                      source: "people",        group: "Voter Data" },
  { key: "voter_status",                   label: "Voter Status",               source: "people",        group: "Voter Data" },
  { key: "voting_frequency",               label: "Voting Frequency",           source: "people",        group: "Voter Data" },
  { key: "early_voter",                    label: "Early Voter",                source: "people",        group: "Voter Data" },
  { key: "absentee_type",                  label: "Absentee Type",              source: "people",        group: "Voter Data" },
  { key: "permanent_absentee",             label: "Permanent Absentee",         source: "people",        group: "Voter Data" },
  { key: "registration_date",              label: "Registration Date",          source: "people",        group: "Voter Data" },
  { key: "veteran",                        label: "Veteran",                    source: "people",        group: "Voter Data" },
  { key: "lalvoteid",                      label: "L2 Voter ID",                source: "people",        group: "Voter Data" },
  { key: "state_voter_id",                 label: "State Voter ID",             source: "people",        group: "Voter Data" },
  { key: "county_voter_id",                label: "County Voter ID",            source: "people",        group: "Voter Data" },
  // Turnout flags
  { key: "voted_general_2024",             label: "Voted General 2024",         source: "people",        group: "Voter Data" },
  { key: "voted_general_2022",             label: "Voted General 2022",         source: "people",        group: "Voter Data" },
  { key: "voted_general_2020",             label: "Voted General 2020",         source: "people",        group: "Voter Data" },
  { key: "voted_general_2018",             label: "Voted General 2018",         source: "people",        group: "Voter Data" },
  { key: "voted_primary_2024",             label: "Voted Primary 2024",         source: "people",        group: "Voter Data" },
  { key: "voted_primary_2022",             label: "Voted Primary 2022",         source: "people",        group: "Voter Data" },
  { key: "voted_primary_2020",             label: "Voted Primary 2020",         source: "people",        group: "Voter Data" },
  { key: "voted_primary_2018",             label: "Voted Primary 2018",         source: "people",        group: "Voter Data" },

  // ── Vote Choices (from votes_history JSONB) ───────────────────────────────
  { key: "vote.2024_presidential_general", label: "Vote: 2024 Presidential",    source: "votes_history", group: "Vote Choices" },
  { key: "vote.2024_presidential_primary", label: "Vote: 2024 Presidential Primary", source: "votes_history", group: "Vote Choices" },
  { key: "vote.2024_general",              label: "Vote: 2024 General",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2024_primary",              label: "Vote: 2024 Primary",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2022_general",              label: "Vote: 2022 General",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2022_primary",              label: "Vote: 2022 Primary",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2020_presidential_general", label: "Vote: 2020 Presidential",    source: "votes_history", group: "Vote Choices" },
  { key: "vote.2020_presidential_primary", label: "Vote: 2020 Presidential Primary", source: "votes_history", group: "Vote Choices" },
  { key: "vote.2020_general",              label: "Vote: 2020 General",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2020_primary",              label: "Vote: 2020 Primary",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2018_general",              label: "Vote: 2018 General",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2018_primary",              label: "Vote: 2018 Primary",         source: "votes_history", group: "Vote Choices" },
  { key: "vote.2016_presidential_general", label: "Vote: 2016 Presidential",    source: "votes_history", group: "Vote Choices" },

  // ── Political Scores ──────────────────────────────────────────────────────
  { key: "likelihood_to_vote",             label: "Likelihood to Vote",         source: "people",        group: "Political Scores" },
  { key: "primary_likelihood",             label: "Primary Likelihood",         source: "people",        group: "Political Scores" },
  { key: "general_primary_likelihood",     label: "General+Primary Likelihood", source: "people",        group: "Political Scores" },
  { key: "score_prog_dem",                 label: "Score: Prog. Dem",           source: "people",        group: "Political Scores" },
  { key: "score_mod_dem",                  label: "Score: Mod. Dem",            source: "people",        group: "Political Scores" },
  { key: "score_cons_rep",                 label: "Score: Cons. Rep",           source: "people",        group: "Political Scores" },
  { key: "score_mod_rep",                  label: "Score: Mod. Rep",            source: "people",        group: "Political Scores" },
  { key: "nolan_personal_score",           label: "Nolan: Personal Freedom",    source: "people",        group: "Political Scores" },
  { key: "nolan_economic_score",           label: "Nolan: Economic Freedom",    source: "people",        group: "Political Scores" },

  // ── Demographics ──────────────────────────────────────────────────────────
  { key: "gender",                         label: "Gender",                     source: "people",        group: "Demographics" },
  { key: "age",                            label: "Age",                        source: "people",        group: "Demographics" },
  { key: "birth_date",                     label: "Birth Date",                 source: "people",        group: "Demographics" },
  { key: "ethnicity",                      label: "Ethnicity",                  source: "people",        group: "Demographics" },
  { key: "education_level",                label: "Education Level",            source: "people",        group: "Demographics" },
  { key: "marital_status",                 label: "Marital Status",             source: "people",        group: "Demographics" },
  { key: "religion",                       label: "Religion",                   source: "people",        group: "Demographics" },
  { key: "language",                       label: "Language",                   source: "people",        group: "Demographics" },
  { key: "income_range",                   label: "Income Range",               source: "people",        group: "Demographics" },
  { key: "net_worth_range",                label: "Net Worth Range",            source: "people",        group: "Demographics" },
  { key: "place_of_birth",                 label: "Place of Birth",             source: "people",        group: "Demographics" },
  { key: "length_of_residence",            label: "Length of Residence",        source: "people",        group: "Demographics" },
  { key: "moved_from_state",               label: "Moved From State",           source: "people",        group: "Demographics" },
  { key: "hispanic_origin",                label: "Hispanic Origin",            source: "people",        group: "Demographics" },

  // ── Mailing Address ───────────────────────────────────────────────────────
  { key: "mailing_address",                label: "Mailing Address",            source: "people",        group: "Address" },
  { key: "mailing_city",                   label: "Mailing City",               source: "people",        group: "Address" },
  { key: "mailing_state",                  label: "Mailing State",              source: "people",        group: "Address" },
  { key: "mailing_zip",                    label: "Mailing Zip",                source: "people",        group: "Address" },
  // Location (via household → location)
  { key: "loc.address_line1",              label: "Address (Location)",         source: "locations",     group: "Address" },
  { key: "loc.city",                       label: "City (Location)",            source: "locations",     group: "Address" },
  { key: "loc.state",                      label: "State (Location)",           source: "locations",     group: "Address" },
  { key: "loc.postal_code",               label: "Zip (Location)",             source: "locations",     group: "Address" },
  { key: "loc.normalized_key",             label: "Full Address (Location)",    source: "locations",     group: "Address" },
  { key: "loc.lat",                        label: "Latitude",                   source: "locations",     group: "Address" },
  { key: "loc.lon",                        label: "Longitude",                  source: "locations",     group: "Address" },

  // ── Contact & Other ───────────────────────────────────────────────────────
  { key: "phone_cell",                     label: "Cell Phone",                 source: "people",        group: "Contact & Other" },
  { key: "phone_landline",                 label: "Landline",                   source: "people",        group: "Contact & Other" },
  { key: "do_not_call",                    label: "Do Not Call",                source: "people",        group: "Contact & Other" },
  { key: "occupation",                     label: "Occupation",                 source: "people",        group: "Contact & Other" },
  { key: "occupation_title",               label: "Occupation Title",           source: "people",        group: "Contact & Other" },
  { key: "company_name",                   label: "Company",                    source: "people",        group: "Contact & Other" },
  { key: "top_issues",                     label: "Top Issues",                 source: "people",        group: "Contact & Other" },
  { key: "notes",                          label: "Notes",                      source: "people",        group: "Contact & Other" },
  // Tenant-scoped (per-org fields)
  { key: "tp.contact_types",               label: "Contact Types",              source: "tenant_people", group: "Contact & Other" },
  { key: "tp.tags",                        label: "Tags",                       source: "tenant_people", group: "Contact & Other" },
  { key: "tp.notes",                       label: "CRM Notes",                  source: "tenant_people", group: "Contact & Other" },
  // Household
  { key: "hh.name",                        label: "Household Name",             source: "households",    group: "Household" },
  // Party affiliation extras
  { key: "party_switcher",                 label: "Party Switcher",             source: "people",        group: "Voter Data" },
];

export const ALLOWED_EXPORT_KEYS = new Set(SURVEY_EXPORT_FIELDS.map(f => f.key));

// Field lookup map for fast access
export const EXPORT_FIELD_MAP = new Map(SURVEY_EXPORT_FIELDS.map(f => [f.key, f]));

// Grouped by group name (preserving insertion order)
export function groupedExportFields(): { group: string; fields: { key: string; label: string }[] }[] {
  const groups = new Map<string, { key: string; label: string }[]>();
  for (const f of SURVEY_EXPORT_FIELDS) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group)!.push({ key: f.key, label: f.label });
  }
  return Array.from(groups.entries()).map(([group, fields]) => ({ group, fields }));
}
