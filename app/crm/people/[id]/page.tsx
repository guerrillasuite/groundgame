// app/crm/people/[id]/page.tsx
import Link from "next/link";
import BackButton from "@/app/crm/_shared/BackButton";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import EditButton from "@/app/crm/_shared/EditButton";
import { updateRowAction } from "@/app/crm/_shared/mutations";
import ContactTypesSelector from "@/app/crm/_shared/ContactTypesSelector";
import RemindersSection from "@/app/components/crm/RemindersSection";
import { TagPicker } from "@/app/components/crm/TagPicker";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const fmtAddr = (l: any) => {
  const nk = (l?.normalized_key ?? "").trim();
  if (nk) return nk;
  const line2 = [l?.city, l?.state].filter(Boolean).join(", ");
  return [l?.address_line1, line2, l?.postal_code].filter(Boolean).join(", ");
};

type Params = { params: { id: string } };

export default async function PersonDetail({ params }: Params) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const personId = params.id;

  // Bind server action for this person
  async function savePerson(fd: FormData) {
    "use server";
    await updateRowAction("people", `/crm/people/${personId}`, fd);
  }

  // 1) Person (joined through tenant_people to enforce tenant isolation)
  const { data: person, error: pErr } = await sb
    .from("people")
    .select(`id, title, first_name, middle_name, middle_initial, last_name, suffix, email, phone, notes, created_at, household_id, active,
      lalvoteid, state_voter_id, county_voter_id, gender, birth_date, age, party, party_switcher, party_switch_type,
      voter_status, registration_date, permanent_absentee, veteran, do_not_call, place_of_birth,
      phone_cell, phone_landline, phone_cell_confidence, mailing_address, mailing_city, mailing_state, mailing_zip,
      score_prog_dem, score_mod_dem, score_cons_rep, score_mod_rep,
      likelihood_to_vote, primary_likelihood, general_primary_likelihood,
      voting_frequency, early_voter, absentee_type,
      voted_general_2024, voted_general_2022, voted_general_2020, voted_general_2018,
      voted_primary_2024, voted_primary_2022, voted_primary_2020, voted_primary_2018,
      votes_history, top_issues,
      ethnicity, ethnicity_source, hispanic_origin, language, english_proficiency,
      education_level, marital_status, religion,
      occupation, occupation_title, company_name, income_range, net_worth_range,
      length_of_residence, moved_from_state, meta_json,
      tenant_people!inner(tenant_id, notes, custom_data, contact_types)`)
    .eq("id", personId)
    .eq("tenant_people.tenant_id", tenant.id)
    .single();

  if (pErr || !person) {
    return <p style={{ padding: 24 }}>Person not found.</p>;
  }

  // 2) Tenant contact type options
  const { data: availableCTs } = await sb
    .from("tenant_contact_types")
    .select("key, label")
    .eq("tenant_id", tenant.id)
    .order("order_index");
  const availableContactTypes: { key: string; label: string }[] = Array.isArray(availableCTs) ? [...availableCTs] : [];
  const rawContactTypes = (person as any).tenant_people?.[0]?.contact_types ?? (person as any).tenant_people?.contact_types;
  const currentContactTypes: string[] = Array.isArray(rawContactTypes) ? rawContactTypes : (rawContactTypes ? [rawContactTypes] : []);

  // Tags — separate queries so a missing column (pre-migration) doesn't break the page
  const { data: tpTagRow } = await sb
    .from("tenant_people")
    .select("tags")
    .eq("tenant_id", tenant.id)
    .eq("person_id", personId)
    .maybeSingle()
    .catch(() => ({ data: null }));
  const currentTagIds: string[] = Array.isArray((tpTagRow as any)?.tags) ? (tpTagRow as any).tags : [];
  const { data: allTagsData } = await sb
    .from("tenant_tags")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .order("name")
    .catch(() => ({ data: null }));
  const allTags: { id: string; name: string }[] = Array.isArray(allTagsData) ? [...allTagsData] : [];

  // 4) Household — try junction table first, then direct field
  let household: { id: string; name: string | null; location_id: string | null } | null = null;
  const { data: phRows } = await sb
    .from("person_households")
    .select("household_id")
    .eq("person_id", personId)
    .eq("tenant_id", tenant.id)
    .limit(1);
  const hhId = phRows?.[0]?.household_id ?? (person as any).household_id ?? null;
  if (hhId) {
    const { data: hh } = await sb
      .from("households")
      .select("id, name, location_id")
      .eq("id", hhId)
      .limit(1)
      .single();
    household = hh ?? null;
  }

  // 3) Location
  let address = "";
  if (household?.location_id) {
    const { data: loc } = await sb
      .from("locations")
      .select("normalized_key, address_line1, city, state, postal_code")
      .eq("id", household.location_id)
      .single();
    if (loc) address = fmtAddr(loc);
  }

  // 4) Lists this person is assigned to
  // Path A: direct person_id link (call lists)
  const { data: listItems } = await sb
    .from("walklist_items")
    .select("walklist_id")
    .eq("person_id", personId);

  // Path B: location link (walk lists) — person → household → location → walklist_items
  let locListItems: { walklist_id: string }[] = [];
  if (household?.location_id) {
    const { data: ll } = await sb
      .from("walklist_items")
      .select("walklist_id")
      .eq("location_id", household.location_id);
    locListItems = (ll ?? []) as typeof locListItems;
  }

  const walklist_ids = [
    ...new Set(
      [...(listItems ?? []), ...locListItems]
        .map((r: any) => r.walklist_id)
        .filter(Boolean)
    ),
  ];
  let assignedLists: { id: string; name: string | null; mode: string | null }[] = [];
  if (walklist_ids.length) {
    const { data: wls } = await sb
      .from("walklists")
      .select("id, name, mode")
      .in("id", walklist_ids);
    assignedLists = (wls ?? []) as typeof assignedLists;
  }

  const fullName = [
    (person as any).title,
    person.first_name,
    (person as any).middle_name ?? ((person as any).middle_initial ? (person as any).middle_initial + "." : null),
    person.last_name,
    (person as any).suffix,
  ].filter(Boolean).join(" ") || "(Unnamed)";
  const initials = [person.first_name?.[0], person.last_name?.[0]].filter(Boolean).join("").toUpperCase();
  const addedDate = person.created_at
    ? new Date(person.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  const cardStyle: React.CSSProperties = {
    background: "var(--gg-card, white)",
    border: "1px solid var(--gg-border, #e5e7eb)",
    borderRadius: "var(--radius, 8px)",
    padding: "20px 24px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--gg-text-dim, #6b7280)",
    marginBottom: 4,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--gg-text, #111827)",
  };

  const dimStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--gg-text-dim, #6b7280)",
    fontStyle: "italic",
  };

  const modeBadge = (mode: string | null) => {
    const m = (mode ?? "").toLowerCase();
    const isCall = m === "call";
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
        background: isCall ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)",
        color: isCall ? "#1d4ed8" : "#166534",
      }}>
        {isCall ? "Call" : "Walk"}
      </span>
    );
  };

  return (
    <section className="stack" style={{ maxWidth: 720 }}>
      {/* Back link */}
      <BackButton href="/crm/people" label="← People" style={{ marginBottom: 4 }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--gg-primary, #2563eb)",
            color: "white", fontWeight: 700, fontSize: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {initials || "?"}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{fullName}</h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {currentContactTypes.length > 0
                ? currentContactTypes.map((t) => {
                    const label = availableContactTypes.find((ct) => ct.key === t)?.label ?? t;
                    return (
                      <span key={t} style={{
                        fontSize: 12, fontWeight: 600,
                        padding: "2px 10px", borderRadius: 10,
                        background: "rgba(99,102,241,0.1)", color: "#4338ca",
                      }}>
                        {label}
                      </span>
                    );
                  })
                : null
              }
              {(person as any).active === false && (
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  padding: "2px 10px", borderRadius: 10,
                  background: "rgba(239,68,68,0.1)", color: "#b91c1c",
                }}>
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>
        <EditButton
          id={personId}
          action={savePerson}
          title="Edit Person"
          fields={[
            { name: "title", label: "Title (Mr./Mrs./Dr.)" },
            { name: "first_name", label: "First Name" },
            { name: "middle_name", label: "Middle Name" },
            { name: "middle_initial", label: "Middle Initial" },
            { name: "last_name", label: "Last Name" },
            { name: "suffix", label: "Suffix (Jr./Sr./III)" },
            { name: "email", label: "Email", type: "email" },
            { name: "phone", label: "Phone", type: "tel" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          initial={person as Record<string, any>}
        />
      </div>

      {/* Contact + Address row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={cardStyle}>
          <p style={labelStyle}>Contact Info</p>
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            <div>
              <p style={{ ...labelStyle, marginBottom: 2 }}>Email</p>
              <p style={person.email ? valueStyle : dimStyle}>{person.email || "—"}</p>
            </div>
            <div>
              <p style={{ ...labelStyle, marginBottom: 2 }}>Phone</p>
              <p style={person.phone ? valueStyle : dimStyle}>{person.phone || "—"}</p>
            </div>
            {(person as any).phone_cell && (
              <div>
                <p style={{ ...labelStyle, marginBottom: 2 }}>Cell</p>
                <p style={valueStyle}>
                  {(person as any).phone_cell}
                  {(person as any).phone_cell_confidence && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--gg-text-dim, #9ca3af)" }}>
                      ({(person as any).phone_cell_confidence})
                    </span>
                  )}
                </p>
              </div>
            )}
            {(person as any).phone_landline && (
              <div>
                <p style={{ ...labelStyle, marginBottom: 2 }}>Landline</p>
                <p style={valueStyle}>{(person as any).phone_landline}</p>
              </div>
            )}
            {(person as any).do_not_call === true && (
              <div>
                <p style={{ ...labelStyle, marginBottom: 2 }}>Do Not Call</p>
                <p style={{ fontSize: 14, color: "#dc2626", fontWeight: 600 }}>Yes</p>
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <p style={labelStyle}>Location</p>
          <div style={{ marginTop: 8 }}>
            {address ? (
              <p style={valueStyle}>{address}</p>
            ) : (
              <p style={dimStyle}>No address on file</p>
            )}
            {household && (
              <Link
                href={`/crm/households/${household.id}`}
                style={{ fontSize: 13, color: "var(--gg-primary, #2563eb)", textDecoration: "none", marginTop: 6, display: "block" }}
              >
                {household.name ?? "(Unnamed Household)"} →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Contact Types */}
      <div style={cardStyle}>
        <p style={labelStyle}>Contact Types</p>
        <div style={{ marginTop: 10 }}>
          <ContactTypesSelector
            personId={personId}
            currentTypes={currentContactTypes}
            availableTypes={availableContactTypes}
            revalidate={`/crm/people/${personId}`}
          />
        </div>
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div style={cardStyle}>
          <p style={labelStyle}>Tags</p>
          <div style={{ marginTop: 10 }}>
            <TagPicker personId={personId} currentTagIds={currentTagIds} allTags={allTags} />
          </div>
        </div>
      )}

      {/* Notes */}
      <div style={cardStyle}>
        <p style={labelStyle}>Notes</p>
        {person.notes ? (
          <p style={{ ...valueStyle, marginTop: 8, whiteSpace: "pre-wrap" }}>{person.notes}</p>
        ) : (
          <p style={{ ...dimStyle, marginTop: 8 }}>No notes</p>
        )}
      </div>

      {/* Assigned Lists */}
      {assignedLists.length > 0 && (
        <div style={cardStyle}>
          <p style={labelStyle}>Lists Assigned</p>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {assignedLists.map((wl) => (
              <div key={wl.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Link
                  href={`/crm/lists/${wl.id}`}
                  style={{ fontSize: 14, color: "var(--gg-text, #111827)", textDecoration: "none" }}
                >
                  {wl.name ?? "(Untitled)"}
                </Link>
                {modeBadge(wl.mode)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voter Record */}
      {(() => {
        const p = person as any;
        const hasVoterBase = p.lalvoteid || p.voter_status || p.registration_date || p.voting_frequency;
        const votingYears = [2024, 2022, 2020, 2018];
        const hasHistory = votingYears.some(y => p[`voted_general_${y}`] !== null || p[`voted_primary_${y}`] !== null);
        if (!hasVoterBase && !hasHistory) return null;
        const voteMark = (val: boolean | null) =>
          val === true
            ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
            : val === false
            ? <span style={{ color: "var(--gg-text-dim, #9ca3af)" }}>○</span>
            : <span style={{ color: "var(--gg-text-dim, #d1d5db)" }}>—</span>;
        return (
          <div style={cardStyle}>
            <p style={{ ...labelStyle, marginBottom: 12 }}>Voter Record</p>
            {hasVoterBase && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px", marginBottom: hasHistory ? 16 : 0 }}>
                {[
                  { label: "Voter ID", val: p.lalvoteid },
                  { label: "State Voter ID", val: p.state_voter_id },
                  { label: "County Voter ID", val: p.county_voter_id },
                  { label: "Voter Status", val: p.voter_status },
                  { label: "Registration Date", val: p.registration_date },
                  { label: "Voting Frequency", val: p.voting_frequency },
                  { label: "Early Voter", val: p.early_voter === true ? "Yes" : p.early_voter === false ? "No" : null },
                  { label: "Absentee Type", val: p.absentee_type },
                  { label: "Permanent Absentee", val: p.permanent_absentee === true ? "Yes" : p.permanent_absentee === false ? "No" : null },
                ].filter(f => f.val != null).map(({ label, val }) => (
                  <div key={label}>
                    <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                    <p style={valueStyle}>{val}</p>
                  </div>
                ))}
              </div>
            )}
            {hasHistory && (
              <>
                <p style={{ ...labelStyle, marginBottom: 8, marginTop: hasVoterBase ? 4 : 0 }}>Voting History</p>
                <table style={{ borderCollapse: "collapse", fontSize: 13, width: "auto" }}>
                  <thead>
                    <tr>
                      <th style={{ ...labelStyle, textAlign: "left", paddingRight: 20, paddingBottom: 4 }}>Year</th>
                      <th style={{ ...labelStyle, textAlign: "center", paddingRight: 20, paddingBottom: 4 }}>General</th>
                      <th style={{ ...labelStyle, textAlign: "center", paddingBottom: 4 }}>Primary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {votingYears.map(year => {
                      const gen = p[`voted_general_${year}`];
                      const pri = p[`voted_primary_${year}`];
                      if (gen === null && pri === null) return null;
                      return (
                        <tr key={year} style={{ borderTop: "1px solid var(--gg-border, #f3f4f6)" }}>
                          <td style={{ paddingRight: 20, paddingTop: 5, paddingBottom: 5, fontWeight: 600, fontSize: 13 }}>{year}</td>
                          <td style={{ textAlign: "center", paddingRight: 20 }}>{voteMark(gen)}</td>
                          <td style={{ textAlign: "center" }}>{voteMark(pri)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        );
      })()}

      {/* Political */}
      {(() => {
        const p = person as any;
        const hasScores = p.party || p.party_switcher != null || p.likelihood_to_vote != null ||
          p.primary_likelihood != null || p.general_primary_likelihood != null ||
          p.score_prog_dem != null || p.score_mod_dem != null ||
          p.score_cons_rep != null || p.score_mod_rep != null;
        const votesHistory: Record<string, string> | null = p.votes_history && Object.keys(p.votes_history).length > 0 ? p.votes_history : null;
        const topIssues: string[] | null = Array.isArray(p.top_issues) && p.top_issues.length > 0 ? p.top_issues : null;
        if (!hasScores && !votesHistory && !topIssues) return null;
        return (
          <div style={cardStyle}>
            <p style={{ ...labelStyle, marginBottom: 12 }}>Political</p>
            {hasScores && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px", marginBottom: votesHistory || topIssues ? 16 : 0 }}>
                {[
                  { label: "Party", val: p.party },
                  { label: "Party Switcher", val: p.party_switcher === true ? "Yes" : p.party_switcher === false ? "No" : null },
                  { label: "Party Switch Type", val: p.party_switch_type },
                  { label: "Likelihood to Vote", val: p.likelihood_to_vote != null ? `${p.likelihood_to_vote}/100` : null },
                  { label: "Primary Likelihood", val: p.primary_likelihood != null ? `${p.primary_likelihood}/100` : null },
                  { label: "G+P Likelihood", val: p.general_primary_likelihood != null ? `${p.general_primary_likelihood}/100` : null },
                  { label: "Progressive Dem", val: p.score_prog_dem != null ? `${p.score_prog_dem}/100` : null },
                  { label: "Moderate Dem", val: p.score_mod_dem != null ? `${p.score_mod_dem}/100` : null },
                  { label: "Conservative Rep", val: p.score_cons_rep != null ? `${p.score_cons_rep}/100` : null },
                  { label: "Moderate Rep", val: p.score_mod_rep != null ? `${p.score_mod_rep}/100` : null },
                ].filter(f => f.val != null).map(({ label, val }) => (
                  <div key={label}>
                    <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                    <p style={valueStyle}>{val}</p>
                  </div>
                ))}
              </div>
            )}
            {topIssues && (
              <div style={{ marginBottom: votesHistory ? 16 : 0 }}>
                <p style={{ ...labelStyle, marginBottom: 6 }}>Top Political Issues</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {topIssues.map((issue) => (
                    <span key={issue} style={{
                      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 10,
                      background: "rgba(37,99,235,0.08)", color: "var(--gg-primary, #2563eb)",
                      border: "1px solid rgba(37,99,235,0.15)",
                    }}>
                      {issue}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {votesHistory && (
              <>
                <p style={{ ...labelStyle, marginBottom: 8 }}>Presidential Vote History</p>
                <table style={{ borderCollapse: "collapse", fontSize: 13, width: "auto" }}>
                  <thead>
                    <tr>
                      <th style={{ ...labelStyle, textAlign: "left", paddingRight: 20, paddingBottom: 4 }}>Election</th>
                      <th style={{ ...labelStyle, textAlign: "left", paddingBottom: 4 }}>Candidate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "2024_presidential_general", label: "2024 General" },
                      { key: "2024_presidential_primary", label: "2024 Primary" },
                      { key: "2020_presidential_general", label: "2020 General" },
                      { key: "2020_presidential_primary", label: "2020 Primary" },
                      { key: "2016_presidential_general", label: "2016 General" },
                      { key: "2016_presidential_primary", label: "2016 Primary" },
                    ].filter(({ key }) => votesHistory[key]).map(({ key, label }) => (
                      <tr key={key} style={{ borderTop: "1px solid var(--gg-border, #f3f4f6)" }}>
                        <td style={{ paddingRight: 20, paddingTop: 5, paddingBottom: 5, fontWeight: 500, color: "var(--gg-text-dim, #6b7280)" }}>{label}</td>
                        <td style={{ fontWeight: 600 }}>{votesHistory[key]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        );
      })()}

      {/* Demographics */}
      {((person as any).gender || (person as any).birth_date || (person as any).ethnicity || (person as any).education_level || (person as any).language || (person as any).marital_status) ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Demographics</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
            {[
              { label: "Gender", val: (person as any).gender },
              { label: "Birth Date", val: (person as any).birth_date },
              { label: "Age", val: (person as any).age != null ? String((person as any).age) : null },
              { label: "Ethnicity", val: (person as any).ethnicity },
              { label: "Hispanic Origin", val: (person as any).hispanic_origin },
              { label: "Ethnicity Source", val: (person as any).ethnicity_source },
              { label: "Language", val: (person as any).language },
              { label: "English Proficiency", val: (person as any).english_proficiency },
              { label: "Education", val: (person as any).education_level },
              { label: "Marital Status", val: (person as any).marital_status },
              { label: "Religion", val: (person as any).religion },
              { label: "Veteran", val: (person as any).veteran === true ? "Yes" : (person as any).veteran === false ? "No" : null },
            ].filter(f => f.val != null).map(({ label, val }) => (
              <div key={label}>
                <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                <p style={valueStyle}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Professional & Financial */}
      {(() => {
        const p = person as any;
        const mailingLine = [
          p.mailing_address,
          [p.mailing_city, p.mailing_state].filter(Boolean).join(", "),
          p.mailing_zip,
        ].filter(Boolean).join(" ");
        const hasAny = p.occupation || p.occupation_title || p.company_name || p.income_range ||
          p.net_worth_range || p.length_of_residence || p.moved_from_state || p.place_of_birth || mailingLine;
        if (!hasAny) return null;
        return (
          <div style={cardStyle}>
            <p style={{ ...labelStyle, marginBottom: 12 }}>Professional &amp; Financial</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
              {[
                { label: "Occupation", val: p.occupation },
                { label: "Occupation Title", val: p.occupation_title },
                { label: "Company", val: p.company_name },
                { label: "Income Range", val: p.income_range },
                { label: "Net Worth Range", val: p.net_worth_range },
                { label: "Length of Residence", val: p.length_of_residence },
                { label: "Moved From State", val: p.moved_from_state },
                { label: "Place of Birth", val: p.place_of_birth },
                { label: "Mailing Address", val: mailingLine || null },
              ].filter(f => f.val != null).map(({ label, val }) => (
                <div key={label}>
                  <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                  <p style={valueStyle}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Tenant Custom Fields (tenant_people.custom_data) */}
      {(() => {
        const cd = (person as any).tenant_people?.[0]?.custom_data;
        if (!cd || Object.keys(cd).length === 0) return null;
        return (
          <details style={cardStyle}>
            <summary style={{ ...labelStyle, cursor: "pointer", marginBottom: 0 }}>
              Custom Fields ({Object.keys(cd).length} fields)
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 20px", marginTop: 12 }}>
              {Object.entries(cd as Record<string, unknown>).map(([k, v]) => (
                <div key={k}>
                  <p style={{ ...labelStyle, marginBottom: 2 }}>{k}</p>
                  <p style={valueStyle}>{String(v ?? "")}</p>
                </div>
              ))}
            </div>
          </details>
        );
      })()}

      {/* Extended Data (meta_json — global shared, Pro only) */}
      {hasFeature(tenant.features, "crm_enrichment") && (person as any).meta_json && Object.keys((person as any).meta_json).length > 0 ? (
        <details style={cardStyle}>
          <summary style={{ ...labelStyle, cursor: "pointer", marginBottom: 0 }}>
            Extended Data ({Object.keys((person as any).meta_json).length} fields)
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 20px", marginTop: 12 }}>
            {Object.entries((person as any).meta_json as Record<string, unknown>).map(([k, v]) => (
              <div key={k}>
                <p style={{ ...labelStyle, marginBottom: 2 }}>{k}</p>
                <p style={valueStyle}>{String(v ?? "")}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* Reminders */}
      <div style={{
        background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 10,
        padding: "16px 18px",
      }}>
        <RemindersSection personId={personId} />
      </div>

      {/* System */}
      {addedDate && (
        <p style={{ fontSize: 12, color: "var(--gg-text-dim, #9ca3af)", textAlign: "right" }}>
          Added {addedDate}
        </p>
      )}
    </section>
  );
}
