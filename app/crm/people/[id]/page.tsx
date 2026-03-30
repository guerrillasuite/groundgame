// app/crm/people/[id]/page.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import EditButton from "@/app/crm/_shared/EditButton";
import { updateRowAction } from "@/app/crm/_shared/mutations";
import RemindersSection from "@/app/components/crm/RemindersSection";

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
    .select(`id, title, first_name, middle_name, middle_initial, last_name, suffix, email, phone, contact_type, notes, created_at, household_id,
      lalvoteid, state_voter_id, county_voter_id, gender, birth_date, age, party, party_switcher,
      voter_status, registration_date, permanent_absentee, veteran, do_not_call, place_of_birth,
      phone_cell, phone_landline, mailing_address,
      score_prog_dem, score_mod_dem, score_cons_rep, score_mod_rep,
      voting_frequency, early_voter, absentee_type,
      ethnicity, ethnicity_source, hispanic_origin, language, english_proficiency,
      education_level, marital_status, religion,
      occupation_title, company_name, income_range, net_worth_range,
      length_of_residence, moved_from_state, meta_json,
      tenant_people!inner(tenant_id, notes, contact_type, custom_data)`)
    .eq("id", personId)
    .eq("tenant_people.tenant_id", tenant.id)
    .single();

  if (pErr || !person) {
    return <p style={{ padding: 24 }}>Person not found.</p>;
  }

  // 2) Household — try junction table first, then direct field
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
      <Link href="/crm/people" style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }}>
        ← People
      </Link>

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
            {person.contact_type && (
              <span style={{
                display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 600,
                padding: "2px 10px", borderRadius: 10,
                background: "rgba(99,102,241,0.1)", color: "#4338ca",
              }}>
                {person.contact_type}
              </span>
            )}
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
            { name: "contact_type", label: "Contact Type" },
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
      {(person as any).lalvoteid || (person as any).voter_status || (person as any).registration_date || (person as any).voting_frequency ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Voter Record</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
            {[
              { label: "Voter ID", val: (person as any).lalvoteid },
              { label: "State Voter ID", val: (person as any).state_voter_id },
              { label: "County Voter ID", val: (person as any).county_voter_id },
              { label: "Voter Status", val: (person as any).voter_status },
              { label: "Registration Date", val: (person as any).registration_date },
              { label: "Voting Frequency", val: (person as any).voting_frequency },
              { label: "Early Voter", val: (person as any).early_voter === true ? "Yes" : (person as any).early_voter === false ? "No" : null },
              { label: "Absentee Type", val: (person as any).absentee_type },
              { label: "Permanent Absentee", val: (person as any).permanent_absentee === true ? "Yes" : (person as any).permanent_absentee === false ? "No" : null },
            ].filter(f => f.val != null).map(({ label, val }) => (
              <div key={label}>
                <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                <p style={valueStyle}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Political */}
      {((person as any).party || (person as any).score_prog_dem != null || (person as any).score_mod_dem != null) ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Political</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
            {[
              { label: "Party", val: (person as any).party },
              { label: "Party Switcher", val: (person as any).party_switcher === true ? "Yes" : (person as any).party_switcher === false ? "No" : null },
              { label: "Progressive Dem", val: (person as any).score_prog_dem != null ? `${(person as any).score_prog_dem}/100` : null },
              { label: "Moderate Dem", val: (person as any).score_mod_dem != null ? `${(person as any).score_mod_dem}/100` : null },
              { label: "Conservative Rep", val: (person as any).score_cons_rep != null ? `${(person as any).score_cons_rep}/100` : null },
              { label: "Moderate Rep", val: (person as any).score_mod_rep != null ? `${(person as any).score_mod_rep}/100` : null },
            ].filter(f => f.val != null).map(({ label, val }) => (
              <div key={label}>
                <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                <p style={valueStyle}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Demographics */}
      {((person as any).gender || (person as any).birth_date || (person as any).ethnicity || (person as any).education_level) ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Demographics</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
            {[
              { label: "Gender", val: (person as any).gender },
              { label: "Birth Date", val: (person as any).birth_date },
              { label: "Age", val: (person as any).age != null ? String((person as any).age) : null },
              { label: "Ethnicity", val: (person as any).ethnicity },
              { label: "Hispanic Origin", val: (person as any).hispanic_origin },
              { label: "Language", val: (person as any).language },
              { label: "Education", val: (person as any).education_level },
              { label: "Marital Status", val: (person as any).marital_status },
              { label: "Religion", val: (person as any).religion },
              { label: "Veteran", val: (person as any).veteran === true ? "Yes" : (person as any).veteran === false ? "No" : null },
              { label: "Do Not Call", val: (person as any).do_not_call === true ? "Yes" : (person as any).do_not_call === false ? "No" : null },
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
      {((person as any).occupation_title || (person as any).company_name || (person as any).income_range) ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Professional &amp; Financial</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
            {[
              { label: "Occupation", val: (person as any).occupation_title },
              { label: "Company", val: (person as any).company_name },
              { label: "Income Range", val: (person as any).income_range },
              { label: "Net Worth Range", val: (person as any).net_worth_range },
              { label: "Length of Residence", val: (person as any).length_of_residence },
              { label: "Moved From State", val: (person as any).moved_from_state },
              { label: "Place of Birth", val: (person as any).place_of_birth },
              { label: "Mailing Address", val: (person as any).mailing_address },
            ].filter(f => f.val != null).map(({ label, val }) => (
              <div key={label}>
                <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                <p style={valueStyle}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
