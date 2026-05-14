import type { FormType } from "@/lib/db/supabase-surveys";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TemplateQuestion = {
  question_text: string;
  question_type: string;
  options?: string[];
  display_format?: "list" | "dropdown" | null;
  crm_field?: string | null;
  required?: boolean;
  order_index: number;
};

export type IntakeTemplate = {
  id: string;
  name: string;
  description: string;
  type: FormType;
  category: string;
  buttonLabel?: string;
  oppTriggerOn?: boolean;
  allowMultiple?: boolean;
  questions: TemplateQuestion[];
  // wspq requires a fixed survey ID format — handled separately in apply-templates
  isWspq?: boolean;
};

// ── Type defaults (pre-filled questions when creating a new form) ─────────────

export function getTypeDefaults(type: FormType, starter?: string): TemplateQuestion[] {
  switch (type) {
    case "person":
      return contactFields();
    case "company":
      return [
        { question_text: "Company Name",   question_type: "text_short",    crm_field: "companies.name",     required: true,  order_index: 1 },
        { question_text: "Industry",       question_type: "multiple_choice", display_format: "dropdown",    crm_field: "companies.industry", required: false, order_index: 2,
          options: ["Agriculture", "Construction", "Education", "Finance", "Healthcare", "Hospitality", "Legal", "Manufacturing", "Media", "Nonprofit", "Real Estate", "Retail", "Tech", "Transportation", "Other"] },
        { question_text: "Contact Name",   question_type: "text_short",    crm_field: "people.first_name",  required: false, order_index: 3 },
        { question_text: "Email",          question_type: "email",          crm_field: "people.email",       required: false, order_index: 4 },
        { question_text: "Phone",          question_type: "phone",          crm_field: "people.phone",       required: false, order_index: 5 },
        { question_text: "Website",        question_type: "text_short",    crm_field: "companies.domain",   required: false, order_index: 6 },
      ];
    case "opportunity":
      return [
        ...contactFields(false),
        { question_text: "Product / Service of Interest", question_type: "text_short", crm_field: null, required: false, order_index: 5 },
        { question_text: "Notes",                         question_type: "text",        crm_field: null, required: false, order_index: 6 },
      ];
    case "event":
      return [
        { question_text: "First Name",                              question_type: "text_short", crm_field: "people.first_name", required: true,  order_index: 1 },
        { question_text: "Last Name",                               question_type: "text_short", crm_field: "people.last_name",  required: true,  order_index: 2 },
        { question_text: "Email",                                   question_type: "email",       crm_field: "people.email",      required: true,  order_index: 3 },
        { question_text: "Phone",                                   question_type: "phone",       crm_field: "people.phone",      required: false, order_index: 4 },
        { question_text: "Dietary or accessibility needs?",        question_type: "text_short", crm_field: null,                required: false, order_index: 5 },
      ];
    case "survey":
      if (starter === "support_oppose") {
        return [
          { question_text: "Which party do you most closely identify with?", question_type: "multiple_choice", options: ["Democrat", "Republican", "Independent", "Other", "No preference"], crm_field: "people.party", required: false, order_index: 1 },
          { question_text: "How strongly do you support our campaign?",      question_type: "multiple_choice", options: ["Strongly Support", "Support", "Neutral", "Oppose", "Strongly Oppose"], crm_field: "people.support_level", required: true,  order_index: 2 },
          { question_text: "Any additional comments?",                       question_type: "text",             crm_field: null,                   required: false, order_index: 3 },
        ];
      }
      if (starter === "top_issue") {
        return [
          { question_text: "What is your top priority issue?",       question_type: "multiple_choice", options: ["Economy / Jobs", "Healthcare", "Education", "Public Safety", "Housing", "Environment", "Immigration", "Other"], crm_field: "people.top_issues", required: true,  order_index: 1 },
          { question_text: "How important is this to your vote?",    question_type: "multiple_choice", options: ["Extremely important", "Very important", "Somewhat important", "Not very important"],                            crm_field: null,                required: false, order_index: 2 },
          { question_text: "Any other thoughts?",                    question_type: "text",             crm_field: null,                   required: false, order_index: 3 },
        ];
      }
      return [];
    case "custom":
    case "wspq":
    default:
      return [];
  }
}

// ── Template definitions ──────────────────────────────────────────────────────

function contactFields(required = true): TemplateQuestion[] {
  return [
    { question_text: "First Name", question_type: "text_short", crm_field: "people.first_name", required, order_index: 1 },
    { question_text: "Last Name",  question_type: "text_short", crm_field: "people.last_name",  required, order_index: 2 },
    { question_text: "Phone",      question_type: "phone",       crm_field: "people.phone",      required, order_index: 3 },
    { question_text: "Email",      question_type: "email",       crm_field: "people.email",      required, order_index: 4 },
  ];
}

export const INTAKE_TEMPLATES: IntakeTemplate[] = [

  // ── Contact Capture ──────────────────────────────────────────────────────

  {
    id: "contact-form",
    name: "Contact Form",
    description: "Capture contact details from individuals",
    type: "person",
    category: "Contact Capture",
    questions: contactFields(),
  },

  {
    id: "newsletter-signup",
    name: "Newsletter Sign-Up",
    description: "Minimal list-growth form — name, email, and topic preferences",
    type: "person",
    category: "Contact Capture",
    buttonLabel: "Subscribe",
    questions: [
      { question_text: "First Name", question_type: "text_short", crm_field: "people.first_name", required: true, order_index: 1 },
      { question_text: "Email",      question_type: "email",       crm_field: "people.email",      required: true, order_index: 2 },
      { question_text: "ZIP Code",   question_type: "text_short", crm_field: null,                required: false, order_index: 3 },
      {
        question_text: "Which updates would you like?",
        question_type: "multiple_select",
        options: ["Events", "Campaign Updates", "Volunteer Opportunities", "Policy News"],
        required: false,
        order_index: 4,
      },
    ],
  },

  {
    id: "volunteer-signup",
    name: "Volunteer Sign-Up",
    description: "Capture skills, availability, and interests for volunteer coordination",
    type: "person",
    category: "Contact Capture",
    questions: [
      ...contactFields(),
      {
        question_text: "What skills or experience do you have?",
        question_type: "multiple_select",
        options: ["Canvassing", "Phone Banking", "Data Entry", "Event Planning", "Social Media", "Writing", "Bilingual / Spanish", "Other"],
        required: false,
        order_index: 5,
      },
      {
        question_text: "When are you available?",
        question_type: "multiple_select",
        options: ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekends"],
        required: false,
        order_index: 6,
      },
      {
        question_text: "What are you most interested in doing?",
        question_type: "multiple_select",
        options: ["Canvassing", "Phone Banking", "Events", "Office / Admin", "Other"],
        required: false,
        order_index: 7,
      },
      {
        question_text: "How did you hear about us?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Friend or family", "Social media", "Event", "Door knock", "Phone call", "Text message", "Email", "Other"],
        required: false,
        order_index: 8,
      },
    ],
  },

  {
    id: "petition",
    name: "Petition",
    description: "Signature collection with address and opt-in acknowledgment",
    type: "person",
    category: "Contact Capture",
    buttonLabel: "Sign Petition",
    questions: [
      { question_text: "First Name", question_type: "text_short", crm_field: "people.first_name", required: true, order_index: 1 },
      { question_text: "Last Name",  question_type: "text_short", crm_field: "people.last_name",  required: true, order_index: 2 },
      { question_text: "Email",      question_type: "email",       crm_field: "people.email",      required: true, order_index: 3 },
      { question_text: "Address",    question_type: "text_short", crm_field: "people.address",    required: false, order_index: 4 },
      { question_text: "City",       question_type: "text_short", crm_field: null,                required: false, order_index: 5 },
      { question_text: "ZIP Code",   question_type: "text_short", crm_field: null,                required: false, order_index: 6 },
      {
        question_text: "I have read and support this petition",
        question_type: "yes_no",
        required: true,
        order_index: 7,
      },
      { question_text: "Comments (optional)", question_type: "text", required: false, order_index: 8 },
    ],
  },

  // ── Business ─────────────────────────────────────────────────────────────

  {
    id: "business-contact",
    name: "Business Contact",
    description: "Capture business and partnership information",
    type: "company",
    category: "Business",
    questions: [
      { question_text: "Company Name", question_type: "text_short", crm_field: "companies.name",     required: true,  order_index: 1 },
      { question_text: "Industry",     question_type: "multiple_choice", display_format: "dropdown", crm_field: "companies.industry",
        options: ["Agriculture", "Construction", "Education", "Finance", "Healthcare", "Hospitality", "Legal", "Manufacturing", "Media", "Nonprofit", "Real Estate", "Retail", "Tech", "Transportation", "Other"],
        required: false, order_index: 2 },
      { question_text: "Website",      question_type: "text_short", crm_field: "companies.domain",   required: false, order_index: 3 },
      { question_text: "Contact Name", question_type: "text_short", crm_field: "people.full_name",   required: true,  order_index: 4 },
      { question_text: "Phone",        question_type: "phone",       crm_field: "people.phone",       required: true,  order_index: 5 },
      { question_text: "Email",        question_type: "email",       crm_field: "people.email",       required: true,  order_index: 6 },
    ],
  },

  // ── Sales & Fundraising ───────────────────────────────────────────────────

  {
    id: "order-form",
    name: "Order Form",
    description: "Take orders and capture sales leads into your pipeline",
    type: "opportunity",
    category: "Sales & Fundraising",
    oppTriggerOn: true,
    questions: [
      ...contactFields(),
      { question_text: "Address", question_type: "text_short", crm_field: "people.address", required: false, order_index: 5 },
      {
        question_text: "Product / Service Interest",
        question_type: "multiple_choice",
        display_format: "dropdown",
        crm_field: "opportunities.product",
        options: ["Option 1", "Option 2", "Option 3"],
        required: false,
        order_index: 6,
      },
      {
        question_text: "How did you hear about us?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Friend or family", "Social media", "Event", "Door knock", "Phone call", "Text message", "Email", "Other"],
        required: false,
        order_index: 7,
      },
      { question_text: "Notes", question_type: "text", required: false, order_index: 8 },
    ],
  },

  {
    id: "donation-form",
    name: "Donation Form",
    description: "Fundraising contact capture with pipeline entry",
    type: "opportunity",
    category: "Sales & Fundraising",
    buttonLabel: "Donate",
    oppTriggerOn: true,
    questions: [
      ...contactFields(),
      {
        question_text: "How much would you like to donate?",
        question_type: "multiple_choice",
        options: ["$25", "$50", "$100", "$250", "$500", "Other"],
        required: false,
        order_index: 5,
      },
      { question_text: "Would you like to make this a monthly gift?", question_type: "yes_no", required: false, order_index: 6 },
      { question_text: "Message or dedication (optional)", question_type: "text", required: false, order_index: 7 },
      {
        question_text: "How did you hear about us?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Friend or family", "Social media", "Event", "Door knock", "Phone call", "Text message", "Email", "Other"],
        required: false,
        order_index: 8,
      },
    ],
  },

  // ── Events ───────────────────────────────────────────────────────────────

  {
    id: "event-registration",
    name: "Event Registration",
    description: "Register attendees for an event",
    type: "event",
    category: "Events",
    questions: [
      { question_text: "First Name", question_type: "text_short", crm_field: "people.first_name", required: true,  order_index: 1 },
      { question_text: "Last Name",  question_type: "text_short", crm_field: "people.last_name",  required: true,  order_index: 2 },
      { question_text: "Phone",      question_type: "phone",       crm_field: "people.phone",      required: false, order_index: 3 },
      { question_text: "Email",      question_type: "email",       crm_field: "people.email",      required: true,  order_index: 4 },
      {
        question_text: "Which event or session are you signing up for?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Session 1", "Session 2", "Session 3"],
        required: true,
        order_index: 5,
      },
      {
        question_text: "How did you hear about this event?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Friend or family", "Social media", "Email", "Door knock", "Phone call", "Other"],
        required: false,
        order_index: 6,
      },
    ],
  },

  {
    id: "volunteer-shift",
    name: "Volunteer Shift Sign-Up",
    description: "Capacity-controlled shift registration for events and campaigns",
    type: "event",
    category: "Events",
    questions: [
      { question_text: "First Name", question_type: "text_short", crm_field: "people.first_name", required: true, order_index: 1 },
      { question_text: "Last Name",  question_type: "text_short", crm_field: "people.last_name",  required: true, order_index: 2 },
      { question_text: "Email",      question_type: "email",       crm_field: "people.email",      required: true, order_index: 3 },
      { question_text: "Phone",      question_type: "phone",       crm_field: "people.phone",      required: true, order_index: 4 },
      {
        question_text: "Which shift are you signing up for?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Shift 1 (Morning)", "Shift 2 (Afternoon)", "Shift 3 (Evening)"],
        required: true,
        order_index: 5,
      },
      { question_text: "Have you volunteered with us before?",             question_type: "yes_no", required: false, order_index: 6 },
      { question_text: "Do you need parking or transportation assistance?", question_type: "yes_no", required: false, order_index: 7 },
      { question_text: "Any notes or questions?", question_type: "text", required: false, order_index: 8 },
    ],
  },

  // ── Field Surveys ─────────────────────────────────────────────────────────

  {
    id: "canvass-survey",
    name: "Canvass Survey",
    description: "Voter ID, support level, top issue, vote likelihood — the core field ops form",
    type: "survey",
    category: "Field Surveys",
    questions: [
      { question_text: "First Name", question_type: "text_short", crm_field: "people.first_name", required: true,  order_index: 1 },
      { question_text: "Last Name",  question_type: "text_short", crm_field: "people.last_name",  required: false, order_index: 2 },
      { question_text: "Phone",      question_type: "phone",       crm_field: "people.phone",      required: false, order_index: 3 },
      { question_text: "Email",      question_type: "email",       crm_field: "people.email",      required: false, order_index: 4 },
      { question_text: "Are you a registered voter?", question_type: "yes_no", required: false, order_index: 5 },
      {
        question_text: "Do you support [candidate / issue]?",
        question_type: "multiple_choice",
        options: ["Strong Support", "Lean Support", "Undecided", "Lean Oppose", "Strong Oppose"],
        required: false,
        order_index: 6,
      },
      {
        question_text: "What is your most important issue?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Economy & Jobs", "Public Safety", "Education", "Healthcare", "Environment", "Housing", "Immigration", "Other"],
        required: false,
        order_index: 7,
      },
      {
        question_text: "How likely are you to vote?",
        question_type: "multiple_choice",
        options: ["Definitely", "Probably", "Maybe", "Probably Not", "Definitely Not"],
        required: false,
        order_index: 8,
      },
      { question_text: "Are you interested in volunteering?", question_type: "yes_no", required: false, order_index: 9 },
    ],
  },

  {
    id: "support-oppose",
    name: "Support / Oppose Survey",
    description: "Ask where people stand on a candidate or issue",
    type: "survey",
    category: "Field Surveys",
    questions: [
      {
        question_text: "Do you support [issue]?",
        question_type: "multiple_choice",
        options: ["Yes", "No", "No Opinion"],
        required: true,
        order_index: 1,
      },
      {
        question_text: "How strongly do you feel about this?",
        question_type: "multiple_choice",
        options: ["Strongly", "Somewhat", "Not very"],
        required: false,
        order_index: 2,
      },
      { question_text: "Comments (optional)", question_type: "text", required: false, order_index: 3 },
    ],
  },

  {
    id: "top-issue",
    name: "Top Issue Survey",
    description: "Find out what matters most to your community",
    type: "survey",
    category: "Field Surveys",
    questions: [
      {
        question_text: "What is your top issue?",
        question_type: "multiple_choice",
        options: ["Economy & Jobs", "Public Safety", "Education", "Healthcare", "Environment", "Housing", "Immigration", "Other"],
        required: true,
        order_index: 1,
      },
      { question_text: "Why is this important to you?", question_type: "text", required: false, order_index: 2 },
      {
        question_text: "What are your top 3 priorities?",
        question_type: "multiple_select",
        options: ["Economy & Jobs", "Public Safety", "Education", "Healthcare", "Environment", "Housing", "Immigration", "Other"],
        required: false,
        order_index: 3,
      },
    ],
  },

  {
    id: "poll-10",
    name: "10-Question Poll",
    description: "Generic political opinion poll — customize the [bracketed] placeholders before publishing",
    type: "survey",
    category: "Field Surveys",
    questions: [
      {
        question_text: "How would you rate the job [official] is doing?",
        question_type: "multiple_choice",
        options: ["Excellent", "Good", "Fair", "Poor"],
        required: false, order_index: 1,
      },
      {
        question_text: "Do you feel [city/state] is heading in the right or wrong direction?",
        question_type: "multiple_choice",
        options: ["Right direction", "Wrong direction", "Not sure"],
        required: false, order_index: 2,
      },
      {
        question_text: "Do you support [policy]?",
        question_type: "multiple_choice",
        options: ["Strongly Support", "Support", "Neutral", "Oppose", "Strongly Oppose"],
        required: false, order_index: 3,
      },
      {
        question_text: "What is the most important issue facing our community?",
        question_type: "multiple_choice",
        display_format: "dropdown",
        options: ["Economy & Jobs", "Public Safety", "Education", "Healthcare", "Environment", "Housing", "Immigration", "Other"],
        required: false, order_index: 4,
      },
      {
        question_text: "How likely are you to vote in the next election?",
        question_type: "multiple_choice",
        options: ["Definitely", "Probably", "Maybe", "Probably Not", "Definitely Not"],
        required: false, order_index: 5,
      },
      {
        question_text: "Which party do you most identify with?",
        question_type: "multiple_choice",
        options: ["Democrat", "Republican", "Independent", "Other", "Prefer not to say"],
        required: false, order_index: 6,
      },
      {
        question_text: "Age range?",
        question_type: "multiple_choice",
        options: ["18–25", "26–35", "36–45", "46–55", "56–65", "65+"],
        required: false, order_index: 7,
      },
      {
        question_text: "How long have you lived in [city/district]?",
        question_type: "multiple_choice",
        options: ["Less than 1 year", "1–5 years", "5–10 years", "More than 10 years"],
        required: false, order_index: 8,
      },
      { question_text: "Any other comments?", question_type: "text", required: false, order_index: 9 },
      { question_text: "May we follow up with you? (Email)", question_type: "email", crm_field: "people.email", required: false, order_index: 10 },
    ],
  },

  {
    id: "feedback-form",
    name: "Feedback Form",
    description: "General satisfaction survey — rating, open comments, NPS-style question",
    type: "survey",
    category: "Field Surveys",
    allowMultiple: true,
    questions: [
      { question_text: "How would you rate your overall experience?", question_type: "rating", required: true, order_index: 1 },
      { question_text: "What did we do well?",      question_type: "text", required: false, order_index: 2 },
      { question_text: "What could we improve?",   question_type: "text", required: false, order_index: 3 },
      {
        question_text: "How likely are you to recommend us to a friend?",
        question_type: "multiple_choice",
        options: ["Very Likely", "Likely", "Neutral", "Unlikely", "Very Unlikely"],
        required: false, order_index: 4,
      },
      { question_text: "Any other comments?", question_type: "text", required: false, order_index: 5 },
    ],
  },

  // ── World's Smallest Political Quiz (special) ─────────────────────────────
  // The survey ID must be wspq-{tenantId} for scoring to work.
  // apply-templates handles this as a special case.

  {
    id: "wspq",
    name: "World's Smallest Political Quiz",
    description: "The classic 10-question Nolan Chart quiz — scores respondents on personal and economic freedom",
    type: "survey",
    category: "Field Surveys",
    buttonLabel: "See My Results",
    isWspq: true,
    questions: [
      // Personal Freedom (Q1–5)
      { question_text: "Government should not censor speech, press, media or Internet.",   question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 1 },
      { question_text: "Military service should be voluntary. There should be no draft.",  question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 2 },
      { question_text: "There should be no laws regarding sex between consenting adults.", question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 3 },
      { question_text: "Repeal laws prohibiting adult possession and use of drugs.",       question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 4 },
      { question_text: "There should be no National ID card.",                             question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 5 },
      // Economic Freedom (Q6–10)
      { question_text: "End \"corporate welfare.\" No government handouts to business.",   question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 6 },
      { question_text: "End government barriers to international free trade.",             question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 7 },
      { question_text: "Let people control their own retirement; privatize Social Security.", question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 8 },
      { question_text: "Replace government welfare with private charity.",                 question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 9 },
      { question_text: "Cut taxes and government spending by 50% or more.",               question_type: "multiple_choice", options: ["Agree", "Maybe / Unsure", "Disagree"], required: true, order_index: 10 },
      // Optional contact capture
      { question_text: "First Name (optional)", question_type: "text_short", crm_field: "people.first_name", required: false, order_index: 11 },
      { question_text: "Last Name (optional)",  question_type: "text_short", crm_field: "people.last_name",  required: false, order_index: 12 },
      { question_text: "Email (optional)",      question_type: "email",       crm_field: "people.email",      required: false, order_index: 13 },
      { question_text: "Phone (optional)",      question_type: "phone",       crm_field: "people.phone",      required: false, order_index: 14 },
    ],
  },
];

// Convenience lookup
export function getTemplate(id: string): IntakeTemplate | undefined {
  return INTAKE_TEMPLATES.find((t) => t.id === id);
}
