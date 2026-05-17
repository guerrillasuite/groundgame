// app/crm/households/[id]/page.tsx
import Link from "next/link";
import BackButton from "@/app/crm/_shared/BackButton";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import RemindersSection from "@/app/components/crm/RemindersSection";
import CustomFieldsWidget from "@/app/components/crm/CustomFieldsWidget";
import HouseholdLocationPicker from "./HouseholdLocationPicker";
import { getFieldOverrides, makeLbl, makeIsHidden } from "@/lib/crm/standard-field-overrides";

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

type Member = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
};

type Params = { params: { id: string } };

export default async function HouseholdDetail({ params }: Params) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const hhId = params.id;

  const overrides = await getFieldOverrides(tenant.id, "households");
  const lbl = makeLbl(overrides);
  const isHidden = makeIsHidden(overrides);

  // 1) Household
  const { data: household, error: hhErr } = await sb
    .from("households")
    .select(`id, name, location_id,
      total_persons, adults_count, children_count, generations_count,
      has_senior, has_young_adult, has_children, is_single_parent, has_disabled,
      household_voter_count, household_parties, head_of_household, household_gender,
      home_owner, home_estimated_value, home_purchase_year, home_dwelling_type,
      home_sqft, home_bedrooms`)
    .eq("id", hhId)
    .single();

  if (hhErr || !household) {
    return <p style={{ padding: 24 }}>Household not found.</p>;
  }

  // 2) Location
  let address = "";
  if (household.location_id) {
    const { data: loc } = await sb
      .from("locations")
      .select("normalized_key, address_line1, city, state, postal_code")
      .eq("id", household.location_id)
      .single();
    if (loc) address = fmtAddr(loc);
  }

  // 3) Members — both link styles, deduplicated
  const memberMap = new Map<string, Member>();

  // Style A: direct people.household_id (filtered through tenant_people for cross-tenant support)
  const { data: directPeople } = await sb
    .from("people")
    .select("id, first_name, last_name, email, phone, contact_type, tenant_people!inner(tenant_id)")
    .eq("household_id", hhId)
    .eq("tenant_people.tenant_id", tenant.id);
  for (const p of (directPeople ?? []) as Member[]) {
    memberMap.set(p.id, p);
  }

  // Style B: person_households junction
  const { data: phRows } = await sb
    .from("person_households")
    .select("person_id")
    .eq("household_id", hhId)
    .eq("tenant_id", tenant.id);
  const phPersonIds = (phRows ?? []).map((r: any) => r.person_id).filter(Boolean);
  if (phPersonIds.length) {
    const { data: junctionPeople } = await sb
      .from("people")
      .select("id, first_name, last_name, email, phone, contact_type")
      .in("id", phPersonIds);
    for (const p of (junctionPeople ?? []) as Member[]) {
      memberMap.set(p.id, p);
    }
  }

  const members = [...memberMap.values()].sort((a, b) => {
    const an = `${a.last_name ?? ""}${a.first_name ?? ""}`.toLowerCase();
    const bn = `${b.last_name ?? ""}${b.first_name ?? ""}`.toLowerCase();
    return an.localeCompare(bn);
  });

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

  return (
    <section className="stack" style={{ maxWidth: 680 }}>
      <style>{`.hh-member:hover { background: var(--gg-bg, #f9fafb) !important; }`}</style>
      {/* Back link */}
      <BackButton href="/crm/households" label="← Households" style={{ marginBottom: 4 }} />

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{household.name ?? "(Unnamed Household)"}</h1>
        {household.location_id && address && (
          <Link
            href={`/crm/locations/${household.location_id}`}
            style={{ marginTop: 4, fontSize: 14, color: "var(--gg-primary, #2563eb)", textDecoration: "none", display: "block" }}
          >
            {address} →
          </Link>
        )}
      </div>

      {/* Location picker */}
      <div style={cardStyle}>
        <p style={labelStyle}>Address</p>
        <div style={{ marginTop: 8 }}>
          <HouseholdLocationPicker
            householdId={hhId}
            locationId={household.location_id ?? null}
            displayText={address}
          />
        </div>
      </div>

      {/* Members */}
      <div style={cardStyle}>
        <p style={{ ...labelStyle, marginBottom: 12 }}>
          Members ({members.length})
        </p>

        {members.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--gg-text-dim, #6b7280)", fontStyle: "italic" }}>
            No members found
          </p>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {members.map((m, i) => {
              const fullName = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "(Unnamed)";
              const initials = [m.first_name?.[0], m.last_name?.[0]].filter(Boolean).join("").toUpperCase();
              const contactLine = [m.email, m.phone].filter(Boolean).join(" · ") || "No contact info";

              return (
                <a
                  key={m.id}
                  href={`/crm/people/${m.id}`}
                  className="hh-member"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 14px",
                    borderRadius: 8,
                    textDecoration: "none",
                    color: "inherit",
                    borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
                    transition: "background 0.1s",
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: "var(--gg-primary, #2563eb)",
                    color: "white", fontWeight: 700, fontSize: 15,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {initials || "?"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{fullName}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 2 }}>
                      {contactLine}
                    </p>
                    {m.contact_type && (
                      <p style={{ margin: 0, fontSize: 12, color: "var(--gg-text-dim, #9ca3af)", marginTop: 1 }}>
                        {m.contact_type}
                      </p>
                    )}
                  </div>

                  {/* Chevron */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: "var(--gg-text-dim, #9ca3af)", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Household Composition */}
      {((household as any).total_persons != null || (household as any).household_voter_count != null || (household as any).household_parties) ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Household Composition</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px 20px" }}>
            {[
              { key: "total_persons",      label: lbl("total_persons",      "Total Persons"),  val: (household as any).total_persons != null ? String((household as any).total_persons) : null },
              { key: "adults_count",       label: lbl("adults_count",       "Adults"),         val: (household as any).adults_count != null ? String((household as any).adults_count) : null },
              { key: "children_count",     label: lbl("children_count",     "Children"),       val: (household as any).children_count != null ? String((household as any).children_count) : null },
              { key: "generations_count",  label: lbl("generations_count",  "Generations"),    val: (household as any).generations_count != null ? String((household as any).generations_count) : null },
              { key: "household_voter_count", label: lbl("household_voter_count", "Voter Count"), val: (household as any).household_voter_count != null ? String((household as any).household_voter_count) : null },
              { key: "household_parties",  label: lbl("household_parties",  "Parties"),        val: (household as any).household_parties },
              { key: "household_gender",   label: lbl("household_gender",   "Gender Comp."),   val: (household as any).household_gender },
              { key: "head_of_household",  label: lbl("head_of_household",  "Head of HH"),     val: (household as any).head_of_household },
              { key: "has_senior",         label: lbl("has_senior",         "Has Senior"),     val: (household as any).has_senior === true ? "Yes" : (household as any).has_senior === false ? "No" : null },
              { key: "has_young_adult",    label: lbl("has_young_adult",    "Has Young Adult"),val: (household as any).has_young_adult === true ? "Yes" : (household as any).has_young_adult === false ? "No" : null },
              { key: "has_children",       label: lbl("has_children",       "Has Children"),   val: (household as any).has_children === true ? "Yes" : (household as any).has_children === false ? "No" : null },
              { key: "is_single_parent",   label: lbl("is_single_parent",   "Single Parent"),  val: (household as any).is_single_parent === true ? "Yes" : (household as any).is_single_parent === false ? "No" : null },
              { key: "has_disabled",       label: lbl("has_disabled",       "Has Disabled"),   val: (household as any).has_disabled === true ? "Yes" : (household as any).has_disabled === false ? "No" : null },
            ].filter(f => f.val != null && !isHidden(f.key)).map(({ key, label, val }) => (
              <div key={key}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 14, color: "var(--gg-text, #111827)", margin: 0 }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Property */}
      {((household as any).home_owner != null || (household as any).home_estimated_value || (household as any).home_dwelling_type) ? (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Property</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px 20px" }}>
            {[
              { key: "home_owner",        label: lbl("home_owner",        "Home Owner"),    val: (household as any).home_owner === true ? "Yes" : (household as any).home_owner === false ? "No" : null },
              { key: "home_estimated_value", label: lbl("home_estimated_value", "Est. Value"), val: (household as any).home_estimated_value != null ? `$${Number((household as any).home_estimated_value).toLocaleString()}` : null },
              { key: "home_purchase_year",label: lbl("home_purchase_year","Purchase Year"), val: (household as any).home_purchase_year != null ? String((household as any).home_purchase_year) : null },
              { key: "home_dwelling_type",label: lbl("home_dwelling_type","Dwelling Type"), val: (household as any).home_dwelling_type },
              { key: "home_sqft",         label: lbl("home_sqft",         "Sq Ft"),         val: (household as any).home_sqft != null ? Number((household as any).home_sqft).toLocaleString() : null },
              { key: "home_bedrooms",     label: lbl("home_bedrooms",     "Bedrooms"),      val: (household as any).home_bedrooms != null ? String((household as any).home_bedrooms) : null },
            ].filter(f => f.val != null && !isHidden(f.key)).map(({ key, label, val }) => (
              <div key={key}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 14, color: "var(--gg-text, #111827)", margin: 0 }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <CustomFieldsWidget recordType="households" recordId={hhId} />

      {/* Reminders */}
      <div style={{
        background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 10,
        padding: "16px 18px",
      }}>
        <RemindersSection householdId={hhId} />
      </div>

    </section>
  );
}
