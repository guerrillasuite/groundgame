// Canonical list of available trigger vars per trigger type.
// Used by both the API route and triggerPayload.ts to stay in sync.
// Add new vars here when you add them to triggerPayload.ts.

export type VarItem = { key: string; label: string };
export type VarGroup = { group: string; items: VarItem[] };

const OPP_GROUPS: VarGroup[] = [
  {
    group: "Opportunity",
    items: [
      { key: "title",    label: "Title" },
      { key: "stage",    label: "Stage" },
      { key: "pipeline", label: "Pipeline" },
      { key: "due_at",   label: "Date & Time" },
      { key: "due_date", label: "Date (date only)" },
      { key: "notes",    label: "Notes" },
    ],
  },
  {
    group: "Person (primary contact)",
    items: [
      { key: "person_name",       label: "Full Name" },
      { key: "person_first_name", label: "First Name" },
      { key: "person_last_name",  label: "Last Name" },
      { key: "person_phone",      label: "Phone" },
      { key: "person_email",      label: "Email" },
    ],
  },
  {
    group: "Pickup Location",
    items: [
      { key: "pickup_location_id", label: "Location ID" },
      { key: "pickup_full",        label: "Display (name + address)" },
    ],
  },
  {
    group: "Dropoff Location",
    items: [
      { key: "dropoff_location_id", label: "Location ID" },
      { key: "dropoff_full",        label: "Display (name + address)" },
    ],
  },
  {
    group: "SitRep Item",
    items: [
      { key: "assignee_names", label: "Assignee Names" },
      { key: "squad_name",     label: "Squad Name" },
    ],
  },
];

const SITREP_ITEM_GROUPS: VarGroup[] = [
  {
    group: "SitRep Item",
    items: [
      { key: "title",          label: "Title" },
      { key: "status",         label: "Status" },
      { key: "due_date",       label: "Due Date" },
      { key: "assignee_names", label: "Assignee Names" },
      { key: "squad_name",     label: "Squad Name" },
    ],
  },
];

export function getVarGroupsForTrigger(triggerType: string): VarGroup[] {
  const OPP_TRIGGERS = new Set([
    "opportunity_created",
    "opportunity_stage_changed",
    "opportunity_updated",
  ]);
  if (OPP_TRIGGERS.has(triggerType)) return OPP_GROUPS;
  return SITREP_ITEM_GROUPS;
}
