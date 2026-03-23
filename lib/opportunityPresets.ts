export type StageDefinition = {
  key: string;
  label: string;
  order_index: number;
};

export type StagePreset = {
  id: string;
  name: string;
  description: string;
  stages: StageDefinition[];
};

function buildStages(labels: string[]): StageDefinition[] {
  return labels.map((label, i) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    label,
    order_index: i,
  }));
}

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: "telemarketing",
    name: "Telemarketing / Financial",
    description: "Classic phone-forward sales: qualify prospects through to closed deals.",
    stages: buildStages(["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"]),
  },
  {
    id: "fundraising",
    name: "Fundraising",
    description: "Donor cultivation from first contact through gift received.",
    stages: buildStages(["New", "Contacted", "Cultivating", "Ask Made", "Pledged", "Donated", "Declined"]),
  },
  {
    id: "retail",
    name: "Retail / Fulfillment",
    description: "Order-forward workflow from lead through delivery.",
    stages: buildStages(["Lead", "Order Placed", "In Fulfillment", "Sent", "Delivered"]),
  },
  {
    id: "construction",
    name: "Construction / Remodeling",
    description: "Job pipeline from estimate request through project completion.",
    stages: buildStages(["Lead", "Estimate Requested", "Estimate Sent", "Contract Signed", "In Progress", "Completed", "Lost"]),
  },
  {
    id: "real_estate",
    name: "Real Estate",
    description: "Property sales from showing through closing.",
    stages: buildStages(["Lead", "Showing", "Offer Made", "Under Contract", "Closed", "Lost"]),
  },
  {
    id: "insurance",
    name: "Insurance Sales",
    description: "Policy pipeline from quote through binding coverage.",
    stages: buildStages(["Lead", "Quoted", "Application", "Underwriting", "Bound", "Declined"]),
  },
  {
    id: "political",
    name: "Political / Canvassing",
    description: "Voter contact workflow from identification through turnout.",
    stages: buildStages(["New", "Contacted", "Persuadable", "Committed", "Voted", "Passed"]),
  },
];
