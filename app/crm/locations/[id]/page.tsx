// app/crm/locations/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import BackButton from "@/app/crm/_shared/BackButton";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import CustomFieldsWidget from "@/app/components/crm/CustomFieldsWidget";
import LocationNameEditor from "./LocationNameEditor";
import { getFieldOverrides, makeLbl, makeIsHidden } from "@/lib/crm/standard-field-overrides";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: Promise<{ id: string }> };

export default async function LocationDetail({ params }: Params) {
  const { id: locId } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const overrides = await getFieldOverrides(tenant.id, "locations");
  const lbl = makeLbl(overrides);
  const isHidden = makeIsHidden(overrides);

  // 1) Location
  const { data: loc, error: locErr } = await sb
    .from("locations")
    .select(`id, address_line1, unit, city, state, postal_code, normalized_key, notes,
      house_number, pre_dir, street_name, street_suffix, post_dir, zip4, street_parity,
      parcel_id, land_use, is_residential, council_district,
      subdivision, type, common_place_name, place_name, lat, lon,
      congressional_district, state_senate_district, state_house_district,
      state_legislative_district, county_name, fips_code, precinct,
      municipality, municipal_subdistrict, county_commission_district,
      county_supervisor_district, school_district, college_district, judicial_district,
      time_zone, urbanicity, population_density,
      census_tract, census_block_group, census_block, dma`)
    .eq("id", locId)
    .eq("tenant_id", tenant.id)
    .single();

  if (locErr || !loc) {
    return (
      <section style={{ padding: 24 }}>
        <BackButton href="/crm/locations" label="← Locations" style={{ marginBottom: 4 }} />
        <p style={{ marginTop: 16, opacity: 0.6 }}>Location not found.</p>
      </section>
    );
  }

  const address = (() => {
    const nk = (loc.normalized_key ?? "").trim();
    if (nk) return nk;
    const line2 = [loc.city, loc.state].filter(Boolean).join(", ");
    return [loc.address_line1, loc.unit, line2, loc.postal_code].filter(Boolean).join(", ");
  })();

  // 2) Households at this location
  const { data: households } = await sb
    .from("households")
    .select("id, name")
    .eq("location_id", locId)
    .eq("tenant_id", tenant.id);

  // 3b) Companies linked to this location
  const { data: companiesRaw } = await sb
    .from("companies")
    .select("id, name, tenant_companies!inner(tenant_id)")
    .eq("location_id", locId)
    .eq("tenant_companies.tenant_id", tenant.id);
  const companies = (companiesRaw ?? []) as Array<{ id: string; name: string | null }>;

  // 3) People via households
  const hhIds = (households ?? []).map((h: any) => h.id);
  let people: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; household_id: string | null }> = [];
  if (hhIds.length > 0) {
    const { data: ppl } = await sb
      .from("people")
      .select("id, first_name, last_name, email, phone, household_id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .in("household_id", hhIds);
    people = (ppl ?? []) as typeof people;
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--gg-card, white)",
    border: "1px solid var(--gg-border, #e5e7eb)",
    borderRadius: "var(--radius, 8px)",
    padding: "20px 24px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--gg-text-dim, #6b7280)",
    marginBottom: 2,
    margin: 0,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--gg-text, #111827)",
    margin: 0,
  };

  function FieldGrid({ fields }: { fields: Array<{ key: string; label: string; val: string | null | undefined }> }) {
    const present = fields.filter(f => f.val != null && f.val !== "");
    if (present.length === 0) return null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
        {present.map(({ key, label, val }) => (
          <div key={key}>
            <p style={labelStyle}>{label}</p>
            <p style={valueStyle}>{val}</p>
          </div>
        ))}
      </div>
    );
  }

  const districtFields = [
    { key: "congressional_district",     label: lbl("congressional_district",     "Congressional District"),     val: loc.congressional_district },
    { key: "state_senate_district",      label: lbl("state_senate_district",      "State Senate District"),      val: loc.state_senate_district },
    { key: "state_house_district",       label: lbl("state_house_district",       "State House District"),       val: loc.state_house_district },
    { key: "state_legislative_district", label: lbl("state_legislative_district", "State Legislative District"), val: loc.state_legislative_district },
    { key: "precinct",                   label: lbl("precinct",                   "Precinct"),                   val: loc.precinct },
    { key: "county_name",                label: lbl("county_name",                "County"),                     val: loc.county_name },
    { key: "municipality",               label: lbl("municipality",               "Municipality"),               val: loc.municipality },
    { key: "municipal_subdistrict",      label: lbl("municipal_subdistrict",      "Municipal Subdistrict"),      val: loc.municipal_subdistrict },
    { key: "county_commission_district", label: lbl("county_commission_district", "County Commission District"), val: loc.county_commission_district },
    { key: "county_supervisor_district", label: lbl("county_supervisor_district", "County Supervisor District"), val: loc.county_supervisor_district },
    { key: "school_district",            label: lbl("school_district",            "School District"),            val: loc.school_district },
    { key: "college_district",           label: lbl("college_district",           "College District"),           val: loc.college_district },
    { key: "judicial_district",          label: lbl("judicial_district",          "Judicial District"),          val: loc.judicial_district },
    { key: "fips_code",                  label: lbl("fips_code",                  "FIPS Code"),                  val: loc.fips_code },
  ].filter(f => !isHidden(f.key));

  const geoFields = [
    { key: "census_tract",       label: lbl("census_tract",       "Census Tract"),        val: loc.census_tract },
    { key: "census_block_group", label: lbl("census_block_group", "Block Group"),          val: loc.census_block_group },
    { key: "census_block",       label: lbl("census_block",       "Census Block"),         val: loc.census_block },
    { key: "dma",                label: lbl("dma",                "DMA"),                  val: loc.dma },
    { key: "urbanicity",         label: lbl("urbanicity",         "Urbanicity"),           val: loc.urbanicity },
    { key: "population_density", label: lbl("population_density", "Population Density"),   val: loc.population_density != null ? `${Number(loc.population_density).toLocaleString()}/sq mi` : null },
    { key: "time_zone",          label: lbl("time_zone",          "Time Zone"),            val: loc.time_zone },
  ].filter(f => !isHidden(f.key));

  const hasDistricts = districtFields.some(f => f.val != null && f.val !== "");
  const hasGeo = geoFields.some(f => f.val != null && f.val !== "");

  // Group people by household
  const hhMap = new Map<string, { id: string; name: string | null; members: typeof people }>();
  for (const hh of households ?? []) {
    hhMap.set(hh.id, { id: hh.id, name: hh.name, members: [] });
  }
  for (const p of people) {
    if (p.household_id && hhMap.has(p.household_id)) {
      hhMap.get(p.household_id)!.members.push(p);
    }
  }

  return (
    <section className="stack" style={{ maxWidth: 780 }}>
      <style>{`.loc-member:hover { background: var(--gg-bg, #f9fafb) !important; }`}</style>
      <BackButton href="/crm/locations" label="← Locations" style={{ marginBottom: 4 }} />

      <div>
        {(loc as any).place_name ? (
          <>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{(loc as any).place_name}</h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>{address || ""}</p>
          </>
        ) : (
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{address || "(No address)"}</h1>
        )}
        {loc.city && !(loc as any).place_name && (
          <p style={{ marginTop: 4, fontSize: 14, color: "var(--gg-text-dim, #6b7280)", margin: "4px 0 0" }}>
            {[loc.city, loc.state, loc.postal_code].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      {/* Name & Notes — always shown, editable */}
      <div style={cardStyle}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
          Name &amp; Notes
        </p>
        <LocationNameEditor locId={locId} initialPlaceName={(loc as any).place_name ?? null} initialNotes={loc.notes ?? null} />
      </div>

      {/* Address Details */}
      {(() => {
        const addrFields = [
          { key: "house_number",    label: lbl("house_number",    "House Number"),   val: loc.house_number },
          { key: "pre_dir",         label: lbl("pre_dir",         "Pre-Direction"),  val: loc.pre_dir },
          { key: "street_name",     label: lbl("street_name",     "Street Name"),    val: loc.street_name },
          { key: "street_suffix",   label: lbl("street_suffix",   "Street Suffix"),  val: loc.street_suffix },
          { key: "post_dir",        label: lbl("post_dir",        "Post-Direction"), val: loc.post_dir },
          { key: "unit",            label: lbl("unit",            "Unit / Apt"),     val: loc.unit },
          { key: "zip4",            label: lbl("zip4",            "Zip+4"),          val: (loc as any).zip4 },
          { key: "street_parity",   label: "Street Parity",                         val: (loc as any).street_parity },
          { key: "parcel_id",       label: lbl("parcel_id",       "Parcel ID"),      val: (loc as any).parcel_id },
          { key: "land_use",        label: lbl("land_use",        "Land Use"),       val: (loc as any).land_use },
          { key: "is_residential",  label: "Residential",                           val: (loc as any).is_residential === true ? "Yes" : (loc as any).is_residential === false ? "No" : null },
          { key: "type",            label: lbl("type",            "Type"),           val: (loc as any).type },
          { key: "common_place_name", label: lbl("common_place_name", "Common Name"), val: (loc as any).common_place_name },
          { key: "place_name",      label: lbl("place_name",      "Place Name"),     val: (loc as any).place_name },
          { key: "subdivision",     label: lbl("subdivision",     "Subdivision"),    val: (loc as any).subdivision },
          { key: "council_district",label: lbl("council_district","Council District"),val: (loc as any).council_district },
        ].filter(f => !isHidden(f.key));
        const present = addrFields.filter(f => f.val != null && f.val !== "");
        const hasCoords = (loc as any).lat != null && (loc as any).lon != null;
        if (present.length === 0 && !hasCoords) return null;
        return (
          <div style={cardStyle}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
              Address Details
            </p>
            <FieldGrid fields={present} />
            {hasCoords && (
              <div style={{ marginTop: present.length > 0 ? 12 : 0 }}>
                <p style={{ ...labelStyle, marginBottom: 2 }}>Coordinates</p>
                <p style={{ ...valueStyle, fontFamily: "monospace", fontSize: 13 }}>
                  {Number((loc as any).lat).toFixed(6)}, {Number((loc as any).lon).toFixed(6)}
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Districts */}
      {hasDistricts && (
        <div style={cardStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
            Districts
          </p>
          <FieldGrid fields={districtFields} />
        </div>
      )}

      {/* Census & Geo */}
      {hasGeo && (
        <div style={cardStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
            Census &amp; Geo
          </p>
          <FieldGrid fields={geoFields} />
        </div>
      )}

      <CustomFieldsWidget recordType="locations" recordId={locId} />

      {/* Companies */}
      {companies.length > 0 && (
        <div style={cardStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
            Companies ({companies.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {companies.map((co) => (
              <Link
                key={co.id}
                href={`/crm/companies/${co.id}`}
                style={{ fontSize: 14, fontWeight: 600, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}
              >
                {co.name ?? "(Unnamed Company)"} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Households & Residents */}
      {hhMap.size > 0 && (
        <div style={cardStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
            Households ({hhMap.size})
          </p>
          <div style={{ display: "grid", gap: 16 }}>
            {[...hhMap.values()].map((hh) => (
              <div key={hh.id}>
                <Link
                  href={`/crm/households/${hh.id}`}
                  style={{ fontSize: 14, fontWeight: 600, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}
                >
                  {hh.name ?? "(Unnamed Household)"} →
                </Link>
                {hh.members.length > 0 && (
                  <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                    {hh.members.map((m, i) => {
                      const fullName = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "(Unnamed)";
                      return (
                        <a
                          key={m.id}
                          href={`/crm/people/${m.id}`}
                          className="loc-member"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: 6,
                            textDecoration: "none",
                            color: "inherit",
                            borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
                            fontSize: 13,
                          }}
                        >
                          <span>{fullName}</span>
                          <span style={{ color: "var(--gg-text-dim, #9ca3af)", fontSize: 12 }}>
                            {[m.email, m.phone].filter(Boolean).join(" · ") || ""}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </section>
  );
}
