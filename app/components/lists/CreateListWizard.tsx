"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Check, Users, Plus } from "lucide-react";
import type { ColumnDef } from "@/app/api/crm/schema/route";
import FilterSection, {
  type FilterRow,
  type FilterOp,
  NO_VALUE_OPS,
  makeFilterId,
  defaultOp,
} from "@/app/components/crm/FilterSection";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppMode = "call" | "knock" | "both" | "text";
type Target = "people" | "households" | "locations" | "companies";

type PersonResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
};

type HouseholdResult = {
  id: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  people_count: number;
};

type LocationResult = {
  id: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  people_count: number;
};

type CompanyResult = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
};

type TenantUser = { id: string; email: string; name: string };

// ─── Fallback schemas (used before API loads) ─────────────────────────────────

const FALLBACK_SCHEMA: Record<string, ColumnDef[]> = {
  people: [
    { column: "first_name",  label: "First Name",   data_type: "text",  is_join: false },
    { column: "last_name",   label: "Last Name",    data_type: "text",  is_join: false },
    { column: "email",       label: "Email",        data_type: "text",  is_join: false },
    { column: "phone",       label: "Phone",        data_type: "text",  is_join: false },
    { column: "contact_type",     label: "Contact Type",       data_type: "text",             is_join: false },
    { column: "tags",             label: "Tags",               data_type: "tag_array",        is_join: false },
    { column: "tp_created_at",    label: "Date Added to CRM",  data_type: "timestamp",        is_join: false },
    { column: "tp_updated_at",    label: "Last Updated in CRM",data_type: "timestamp",        is_join: false },
    { column: "completed_survey", label: "Completed Survey",   data_type: "survey_completion",is_join: false },
    { column: "party",            label: "Party",              data_type: "text",             is_join: false },
    { column: "city",        label: "City",         data_type: "text",      is_join: true  },
    { column: "state",       label: "State",        data_type: "text",      is_join: true  },
    { column: "postal_code", label: "Zip Code",     data_type: "text",      is_join: true  },
  ],
  households: [
    { column: "name",                label: "Household Name",     data_type: "text",     is_join: false },
    { column: "total_persons",       label: "Total Persons",      data_type: "smallint", is_join: false },
    { column: "adults_count",        label: "Adults Count",       data_type: "smallint", is_join: false },
    { column: "children_count",      label: "Children Count",     data_type: "smallint", is_join: false },
    { column: "household_voter_count", label: "Voter Count",      data_type: "smallint", is_join: false },
    { column: "household_parties",   label: "Parties",            data_type: "text",     is_join: false },
    { column: "has_senior",          label: "Has Senior",         data_type: "boolean",  is_join: false },
    { column: "has_young_adult",     label: "Has Young Adult",    data_type: "boolean",  is_join: false },
    { column: "has_children",        label: "Has Children",       data_type: "boolean",  is_join: false },
    { column: "home_owner",          label: "Home Owner",         data_type: "boolean",  is_join: false },
    { column: "home_dwelling_type",  label: "Dwelling Type",      data_type: "text",     is_join: false },
    { column: "home_estimated_value",label: "Est. Home Value",    data_type: "integer",  is_join: false },
    { column: "home_sqft",           label: "Sq Ft",              data_type: "integer",  is_join: false },
    { column: "home_bedrooms",       label: "Bedrooms",           data_type: "smallint", is_join: false },
    { column: "city",                label: "City",               data_type: "text",     is_join: true  },
    { column: "state",               label: "State",              data_type: "text",     is_join: true  },
    { column: "postal_code",         label: "Zip Code",           data_type: "text",     is_join: true  },
  ],
  locations: [
    { column: "address_line1", label: "Street Address", data_type: "text", is_join: false },
    { column: "city",          label: "City",           data_type: "text", is_join: false },
    { column: "state",         label: "State",          data_type: "text", is_join: false },
    { column: "postal_code",   label: "Zip Code",       data_type: "text", is_join: false },
  ],
  companies: [
    { column: "name",     label: "Company Name", data_type: "text", is_join: false },
    { column: "phone",    label: "Phone",        data_type: "text", is_join: false },
    { column: "email",    label: "Email",        data_type: "text", is_join: false },
    { column: "industry", label: "Industry",     data_type: "text", is_join: false },
  ],
  opportunities: [
    { column: "title",        label: "Opportunity Title", data_type: "text",    is_join: false },
    { column: "stage",        label: "Stage",             data_type: "text",    is_join: false },
    { column: "amount_cents", label: "Amount ($)",        data_type: "integer", is_join: false },
    { column: "priority",     label: "Priority",          data_type: "text",    is_join: false },
  ],
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 11px",
  borderRadius: 7,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  padding: "8px 32px 8px 11px",
  borderRadius: 7,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

const cardStyle: React.CSSProperties = {
  background: "var(--gg-card, white)",
  borderRadius: 12,
  border: "1px solid var(--gg-border, #e5e7eb)",
  padding: 24,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 4,
  color: "var(--gg-text-dim, #6b7280)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function primaryBtn(disabled = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 18px",
    borderRadius: 8,
    background: disabled ? "rgba(37,99,235,0.3)" : "var(--gg-primary, #2563eb)",
    color: "white",
    fontWeight: 700,
    fontSize: 14,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    padding: "9px 18px",
    borderRadius: 8,
    border: `2px solid ${active ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`,
    background: active ? "rgba(37,99,235,0.07)" : "none",
    color: active ? "var(--gg-primary, #2563eb)" : "var(--gg-text-dim, #6b7280)",
    fontWeight: active ? 700 : 500,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.15s",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fullName(p: PersonResult) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "(No name)";
}

function initials(name: string) {
  return (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const MODE_LABELS: Record<AppMode, string> = {
  call: "Dials (Call List)",
  knock: "Doors (Walk List)",
  both: "Dials + Doors (Both)",
  text: "Text Outreach",
};

const TARGET_LABELS: Record<Target, string> = {
  people: "People",
  households: "Households",
  locations: "Locations",
  companies: "Companies",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreateListWizard() {
  const router = useRouter();

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [appMode, setAppMode] = useState<AppMode>("call");
  const [target, setTarget] = useState<Target>("people");

  // Per-table schemas
  const [schemas, setSchemas] = useState<Record<string, ColumnDef[]>>(FALLBACK_SCHEMA);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Opportunity stages (for dynamic stage chips)
  const [stages, setStages] = useState<{ key: string; label: string }[]>([]);
  const [contactTypeOpts, setContactTypeOpts] = useState<string[]>([]);
  const [tagOpts, setTagOpts] = useState<string[]>([]);

  // Per-section filter state
  const [primaryFilters, setPrimaryFilters] = useState<FilterRow[]>(() => [
    { id: makeFilterId(), field: "first_name", op: "contains", value: "", data_type: "text" },
  ]);
  const [locFilters,  setLocFilters]  = useState<FilterRow[]>([]);
  const [hhFilters,   setHhFilters]   = useState<FilterRow[]>([]);
  const [oppFilters,  setOppFilters]  = useState<FilterRow[]>(() => [
    { id: makeFilterId(), field: "stage", op: "equals", value: "", data_type: "text" },
  ]);
  const [results, setResults] = useState<(PersonResult | HouseholdResult | LocationResult | CompanyResult)[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Step 3
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [assignAll, setAssignAll] = useState(true);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());

  // Capture mode (step 1)
  type CaptureMode = "none" | "survey" | "opportunity";
  const [captureMode, setCaptureMode] = useState<CaptureMode>("none");
  const [captureSurveyId, setCaptureSurveyId] = useState("");
  const [surveys, setSurveys] = useState<{ id: string; title: string }[]>([]);

  // Step 4
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  async function loadAllSchemas() {
    setSchemaLoading(true);
    const tables = ["people", "households", "locations", "companies", "opportunities"];
    const results = await Promise.allSettled(
      tables.map((t) => fetch(`/api/crm/schema?table=${t}`).then((r) => r.json()))
    );
    const updated: Record<string, ColumnDef[]> = { ...FALLBACK_SCHEMA };
    tables.forEach((t, i) => {
      const r = results[i];
      if (r.status === "fulfilled" && Array.isArray(r.value) && r.value.length > 0) {
        updated[t] = r.value;
      }
    });
    setSchemas(updated);
    setSchemaLoading(false);
  }

  function changeTarget(t: Target) {
    setTarget(t);
    setResults([]);
    setSelectedIds(new Set());
    setHasSearched(false);
    setSearchErr(null);
    // Reset primary filters to first field of new target's schema
    const cols = schemas[t] ?? FALLBACK_SCHEMA[t] ?? [];
    const first = cols.filter((c: ColumnDef) => !c.is_join)[0] ?? cols[0];
    if (first) {
      setPrimaryFilters([{ id: makeFilterId(), field: first.column, op: defaultOp(first.data_type), value: "", data_type: first.data_type }]);
    }
  }

  // Load all schemas, stages, contact types, and tags on mount
  useEffect(() => {
    loadAllSchemas();
    fetch("/api/crm/opportunities/stages")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setStages(d); })
      .catch(() => {});
    fetch("/api/crm/settings/contact-types")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setContactTypeOpts(d.map((t: any) => t.key).filter(Boolean)); })
      .catch(() => {});
    fetch("/api/crm/tags")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setTagOpts(d.map((t: any) => t.name).filter(Boolean)); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load available surveys on mount
  useEffect(() => {
    fetch("/api/survey")
      .then((r) => r.json())
      .then((d) => setSurveys(Array.isArray(d) ? d : []))
      .catch(() => setSurveys([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    setUsersLoading(true);
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [step]);

  // ── Search ────────────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchErr(null);
    setSelectedIds(new Set());
    setHasSearched(true);
    try {
      function cleanFilters(rows: FilterRow[]) {
        return rows
          .filter((f) => f.field && (f.value.trim() || NO_VALUE_OPS.includes(f.op)))
          .map(({ field, op, value, data_type }) => ({ field, op, value, data_type }));
      }

      const body: any = { target };

      if (target === "locations") {
        // Primary = location filters; locFilters = people cross-join; hhFilters = households cross-join
        body.filters = cleanFilters(primaryFilters);
        const pf = cleanFilters(locFilters);
        const hf = cleanFilters(hhFilters);
        if (pf.length || hf.length) {
          body.link_filters = {};
          if (pf.length) body.link_filters.people = pf;
          if (hf.length) body.link_filters.households = hf;
        }
      } else {
        // Primary + location join + household join all go into main filters array
        // (search route splits them by LOCATION_JOIN_FIELDS / HOUSEHOLD_JOIN_FIELDS)
        body.filters = [
          ...cleanFilters(primaryFilters),
          ...cleanFilters(locFilters),
          ...cleanFilters(hhFilters),
        ];
        const of = cleanFilters(oppFilters);
        if (of.length && (target === "people" || target === "companies")) {
          body.link_filters = { opportunities: of };
        }
      }

      const res = await fetch("/api/crm/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults([...data]);
    } catch (err: any) {
      setSearchErr(err.message ?? "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await fetch("/api/crm/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          app_mode: appMode,
          target,
          selected_ids: [...selectedIds],
          user_ids: assignAll ? [] : [...assignedUserIds],
          call_capture_mode: captureMode === "none" ? null : captureMode,
          survey_id: captureMode === "survey" ? captureSurveyId || null : null,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create list");
      // Surface any per-walklist warnings (e.g. no location IDs resolved)
      const warnings = (data.walklists ?? [])
        .filter((w: any) => w.warning)
        .map((w: any) => `${w.name}: ${w.warning}`)
        .join("\n");
      if (warnings) {
        setCreateErr(`List(s) created but with issues:\n${warnings}`);
        setCreating(false);
        return;
      }
      router.push("/crm/lists");
    } catch (err: any) {
      setCreateErr(err.message ?? "Failed to create list");
      setCreating(false);
    }
  }

  const resultCount = results.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="stack" style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() =>
            step === 1 ? router.push("/crm/lists") : setStep((s) => (s - 1) as 1 | 2 | 3 | 4)
          }
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: "var(--gg-text-dim, #6b7280)", display: "flex" }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ margin: 0 }}>Create List</h1>
          <p className="text-dim" style={{ marginTop: 4, fontSize: 13 }}>
            Step {step} of 4 —{" "}
            {step === 1 ? "Name & Type" : step === 2 ? "Filter & Search" : step === 3 ? "Assign Users" : "Review & Create"}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 5 }}>
        {[1, 2, 3, 4].map((s) => (
          <div key={s} style={{
            height: 4, flex: 1, borderRadius: 4,
            background: s < step ? "var(--gg-primary, #2563eb)" : s === step ? "rgba(37,99,235,0.45)" : "var(--gg-border, #e5e7eb)",
            transition: "background 0.2s",
          }} />
        ))}
      </div>

      {/* ─── STEP 1: Name & Type ─────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ ...cardStyle, display: "grid", gap: 24 }}>
          <div>
            <label style={labelStyle}>List Name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ward 5 Voters, Downtown Walk"
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Shows up as</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {(["call", "knock", "both", "text"] as AppMode[]).map((m) => (
                <button key={m} type="button" onClick={() => setAppMode(m)} style={toggleBtn(appMode === m)}>
                  {m === "call" ? "📞 Dials" : m === "knock" ? "🚪 Doors" : m === "both" ? "📞🚪 Both" : "💬 Texts"}
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
              {appMode === "call"
                ? "Appears in the phone banking dialer."
                : appMode === "knock"
                ? "Appears in the door-knocking map."
                : appMode === "text"
                ? "Appears in the text banking tool. Field workers text each person using a shared script."
                : 'Creates two lists: "[Name] — Calls" and "[Name] — Doors".'}
            </p>
          </div>

          {appMode === "text" && (
            <div>
              <label style={labelStyle}>Text Script <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <textarea
                style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Hi {name}, this is [Your Name] with [Org]. We're reaching out about..."
              />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                Shown to field workers in the texting interface — they can copy and paste it into the SMS app.
              </p>
            </div>
          )}

          <div>
            <label style={labelStyle}>Search by</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {(appMode === "knock" || appMode === "both"
                ? (["people", "households", "locations"] as Target[])
                : (["people", "households", "locations", "companies"] as Target[])
              ).map((t) => (
                <button key={t} type="button" onClick={() => changeTarget(t)} style={toggleBtn(target === t)}>
                  {t === "people" ? "👤 People" : t === "households" ? "🏠 Households" : t === "locations" ? "📍 Locations" : "🏢 Companies"}
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
              {target === "people"
                ? "Filter by name, contact type, notes, location, and more."
                : target === "households"
                ? "Filter households by address — adds all members to the list."
                : target === "companies"
                ? "Filter by company name, phone, email, or industry."
                : "Filter by street address, city, state, or zip code."}
            </p>
          </div>

          {appMode !== "text" && (
            <div>
              <label style={labelStyle}>Capture Mode</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {(["none", "survey", "opportunity"] as CaptureMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setCaptureMode(m)} style={toggleBtn(captureMode === m)}>
                    {m === "none" ? "None" : m === "survey" ? "Survey" : "Possible Opportunity"}
                  </button>
                ))}
              </div>
              {captureMode === "survey" && (
                <select
                  value={captureSurveyId}
                  onChange={(e) => setCaptureSurveyId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">(Select a survey)</option>
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              )}
              {captureMode === "opportunity" && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                  Field workers will be prompted to log a potential opportunity after each contact.
                </p>
              )}
              {captureMode === "none" && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
                  No data capture after contact — call/knock result only.
                </p>
              )}
            </div>
          )}

          <button disabled={!name.trim()} onClick={() => setStep(2)} style={primaryBtn(!name.trim())}>
            Build Filters →
          </button>
        </div>
      )}

      {/* ─── STEP 2: Filter Builder ──────────────────────────────────────── */}
      {step === 2 && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Filter {TARGET_LABELS[target]}</span>
              <span style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginLeft: 8 }}>
                All conditions match (AND). Leave sections empty to match everything.
              </span>
            </div>

            <form onSubmit={handleSearch}>
              {schemaLoading && (
                <p style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", margin: "0 0 8px" }}>Loading fields…</p>
              )}

              {/* ── People target ── */}
              {target === "people" && (
                <>
                  <FilterSection title="People" filters={primaryFilters} schema={schemas.people ?? []} onChange={setPrimaryFilters} defaultOpen hideJoined dynamicEnumOpts={{ contact_type: contactTypeOpts, tags: tagOpts, completed_survey: surveys.map((s) => s.title) }} />
                  <FilterSection title="Location" filters={locFilters} schema={schemas.locations ?? []} onChange={setLocFilters} />
                  <FilterSection title="Household" filters={hhFilters} schema={schemas.households ?? []} onChange={setHhFilters} hideJoined />
                  <FilterSection
                    title="Linked Opportunities"
                    filters={oppFilters}
                    schema={schemas.opportunities ?? []}
                    onChange={setOppFilters}
                    hideJoined
                    dynamicEnumOpts={{ stage: stages.map((s) => s.key) }}
                  />
                </>
              )}

              {/* ── Households target ── */}
              {target === "households" && (
                <>
                  <FilterSection title="Households" filters={primaryFilters} schema={schemas.households ?? []} onChange={setPrimaryFilters} defaultOpen />
                  <FilterSection title="Location" filters={locFilters} schema={schemas.locations ?? []} onChange={setLocFilters} />
                </>
              )}

              {/* ── Locations target ── */}
              {target === "locations" && (
                <>
                  <FilterSection title="Locations" filters={primaryFilters} schema={schemas.locations ?? []} onChange={setPrimaryFilters} defaultOpen />
                  <FilterSection title="People (linked)" filters={locFilters} schema={schemas.people ?? []} onChange={setLocFilters} hideJoined />
                  <FilterSection title="Households (linked)" filters={hhFilters} schema={schemas.households ?? []} onChange={setHhFilters} hideJoined />
                </>
              )}

              {/* ── Companies target ── */}
              {target === "companies" && (
                <>
                  <FilterSection title="Companies" filters={primaryFilters} schema={schemas.companies ?? []} onChange={setPrimaryFilters} defaultOpen />
                  <FilterSection
                    title="Linked Opportunities"
                    filters={oppFilters}
                    schema={schemas.opportunities ?? []}
                    onChange={setOppFilters}
                    hideJoined
                    dynamicEnumOpts={{ stage: stages.map((s) => s.key) }}
                  />
                </>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
                <button type="submit" disabled={searching} style={primaryBtn(searching)}>
                  <Search size={15} />
                  {searching ? "Searching…" : "Search"}
                </button>

                {hasSearched && !searching && (
                  <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
                    {resultCount === 0 ? "No results" : `${resultCount.toLocaleString()} result${resultCount !== 1 ? "s" : ""}`}
                  </span>
                )}
              </div>

              {searchErr && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10, marginBottom: 0 }}>{searchErr}</p>}
            </form>
          </div>

          {/* Results table */}
          {hasSearched && resultCount > 0 && (
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--gg-border, #e5e7eb)" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {selectedIds.size} of {resultCount.toLocaleString()} selected
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setSelectedIds(new Set(results.map((r) => r.id)))} style={{ fontSize: 12, fontWeight: 600, color: "var(--gg-primary, #2563eb)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                    All
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                    None
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {target === "people" && (results as PersonResult[]).map((p) => (
                  <label key={p.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "9px 16px", cursor: "pointer", borderBottom: "1px solid var(--gg-border, #f3f4f6)", background: selectedIds.has(p.id) ? "rgba(37,99,235,0.04)" : "transparent" }}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleId(p.id)} style={{ accentColor: "var(--gg-primary, #2563eb)", width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{fullName(p)}</div>
                      <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 1 }}>{[p.email, p.phone].filter(Boolean).join(" · ")}</div>
                    </div>
                    {p.contact_type && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "rgba(37,99,235,0.08)", color: "var(--gg-primary, #2563eb)", whiteSpace: "nowrap" }}>
                        {p.contact_type}
                      </span>
                    )}
                    {selectedIds.has(p.id) && <Check size={14} color="var(--gg-primary, #2563eb)" />}
                  </label>
                ))}

                {target === "households" && (results as HouseholdResult[]).map((h) => (
                  <label key={h.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "9px 16px", cursor: "pointer", borderBottom: "1px solid var(--gg-border, #f3f4f6)", background: selectedIds.has(h.id) ? "rgba(37,99,235,0.04)" : "transparent" }}>
                    <input type="checkbox" checked={selectedIds.has(h.id)} onChange={() => toggleId(h.id)} style={{ accentColor: "var(--gg-primary, #2563eb)", width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{h.name || "(Unnamed household)"}</div>
                      <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 1 }}>{[h.address, h.city, h.state, h.postal_code].filter(Boolean).join(", ")}</div>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", whiteSpace: "nowrap" }}>{h.people_count} {h.people_count === 1 ? "person" : "people"}</span>
                    {selectedIds.has(h.id) && <Check size={14} color="var(--gg-primary, #2563eb)" />}
                  </label>
                ))}

                {target === "locations" && (results as LocationResult[]).map((l) => (
                  <label key={l.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "9px 16px", cursor: "pointer", borderBottom: "1px solid var(--gg-border, #f3f4f6)", background: selectedIds.has(l.id) ? "rgba(37,99,235,0.04)" : "transparent" }}>
                    <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleId(l.id)} style={{ accentColor: "var(--gg-primary, #2563eb)", width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.address || "(No address)"}</div>
                      <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 1 }}>{[l.city, l.state, l.postal_code].filter(Boolean).join(", ")}</div>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", whiteSpace: "nowrap" }}>{l.people_count} {l.people_count === 1 ? "person" : "people"}</span>
                    {selectedIds.has(l.id) && <Check size={14} color="var(--gg-primary, #2563eb)" />}
                  </label>
                ))}

                {target === "companies" && (results as CompanyResult[]).map((c) => (
                  <label key={c.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "9px 16px", cursor: "pointer", borderBottom: "1px solid var(--gg-border, #f3f4f6)", background: selectedIds.has(c.id) ? "rgba(37,99,235,0.04)" : "transparent" }}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleId(c.id)} style={{ accentColor: "var(--gg-primary, #2563eb)", width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || "(Unnamed company)"}</div>
                      <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 1 }}>{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                    </div>
                    {c.industry && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "rgba(37,99,235,0.08)", color: "var(--gg-primary, #2563eb)", whiteSpace: "nowrap" }}>
                        {c.industry}
                      </span>
                    )}
                    {selectedIds.has(c.id) && <Check size={14} color="var(--gg-primary, #2563eb)" />}
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedIds.size > 0 && (
            <button onClick={() => setStep(3)} style={primaryBtn()}>
              Assign Users ({selectedIds.size} selected) →
            </button>
          )}
        </div>
      )}

      {/* ─── STEP 3: Assign Users ────────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={18} />
                Assign to Users
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
                Who should see this list in the canvassing app? Unassigned lists are visible to everyone.
              </p>
            </div>

            {/* Assign to All */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, border: `2px solid ${assignAll ? "var(--gg-primary, #2563eb)" : "var(--gg-border, #e5e7eb)"}`, background: assignAll ? "rgba(37,99,235,0.05)" : "transparent", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={assignAll}
                onChange={(e) => { setAssignAll(e.target.checked); if (e.target.checked) setAssignedUserIds(new Set()); }}
                style={{ accentColor: "var(--gg-primary, #2563eb)", width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Visible to Everyone</div>
                <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>All users can see and work this list</div>
              </div>
            </label>

            {!assignAll && (
              <div style={{ display: "grid", gap: 6 }}>
                {usersLoading && <p style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", margin: 0 }}>Loading users…</p>}
                {!usersLoading && users.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", margin: 0 }}>
                    No users found — check that SUPABASE_SERVICE_ROLE_KEY is configured.
                  </p>
                )}
                {!usersLoading && users.map((u) => (
                  <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${assignedUserIds.has(u.id) ? "rgba(37,99,235,0.2)" : "transparent"}`, background: assignedUserIds.has(u.id) ? "rgba(37,99,235,0.04)" : "transparent" }}>
                    <input
                      type="checkbox"
                      checked={assignedUserIds.has(u.id)}
                      onChange={() => setAssignedUserIds((prev) => { const n = new Set(prev); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })}
                      style={{ accentColor: "var(--gg-primary, #2563eb)", width: 15, height: 15 }}
                    />
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--gg-primary, #2563eb)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {initials(u.name || u.email)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                      {u.name !== u.email && <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>{u.email}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setStep(4)} style={primaryBtn()}>
            Review & Create →
          </button>
        </div>
      )}

      {/* ─── STEP 4: Review & Create ─────────────────────────────────────── */}
      {step === 4 && (
        <div style={{ ...cardStyle, display: "grid", gap: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Ready to Create</h2>

          <div style={{ background: "var(--gg-bg, #f9fafb)", borderRadius: 10, padding: "16px 20px", display: "grid", gap: 10 }}>
            {[
              { label: "List Name", value: name },
              { label: "Type", value: MODE_LABELS[appMode] },
              { label: "Search target", value: TARGET_LABELS[target] },
              { label: "Members", value: `${selectedIds.size.toLocaleString()} ${TARGET_LABELS[target].toLowerCase()} selected` },
              { label: "Assigned to", value: assignAll ? "Everyone" : assignedUserIds.size === 0 ? "Everyone (none selected)" : `${assignedUserIds.size} user${assignedUserIds.size !== 1 ? "s" : ""}` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", gap: 12 }}>
                <span style={{ minWidth: 130, fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>{label}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{value}</span>
              </div>
            ))}

            {appMode === "both" && (
              <div style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)", paddingTop: 10, marginTop: 4 }}>
                <p style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", margin: 0 }}>
                  Creates two lists: <strong>"{name} — Calls"</strong> and <strong>"{name} — Doors"</strong>
                </p>
              </div>
            )}
          </div>

          {createErr && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{createErr}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleCreate} disabled={creating} style={{ ...primaryBtn(creating), padding: "12px 24px", fontSize: 15 }}>
              <Plus size={16} />
              {creating ? "Creating…" : `Create ${appMode === "both" ? "Both Lists" : "List"}`}
            </button>
            <button onClick={() => setStep(3)} disabled={creating} style={{ padding: "12px 16px", borderRadius: 8, background: "none", border: "1px solid var(--gg-border, #e5e7eb)", fontWeight: 600, fontSize: 14, cursor: creating ? "not-allowed" : "pointer", color: "var(--gg-text, #111827)" }}>
              ← Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
