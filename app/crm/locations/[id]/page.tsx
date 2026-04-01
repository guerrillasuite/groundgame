// app/crm/locations/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import BackButton from "@/app/crm/_shared/BackButton";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

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

  function FieldGrid({ fields }: { fields: Array<{ label: string; val: string | null | undefined }> }) {
    const present = fields.filter(f => f.val != null && f.val !== "");
    if (present.length === 0) return null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
        {present.map(({ label, val }) => (
          <div key={label}>
            <p style={labelStyle}>{label}</p>
            <p style={valueStyle}>{val}</p>
          </div>
        ))}
      </div>
    );
  }

  const districtFields = [
    { label: "Congressional District", val: loc.congressional_district },
    { label: "State Senate District", val: loc.state_senate_district },
    { label: "State House District", val: loc.state_house_district },
    { label: "State Legislative District", val: loc.state_legislative_district },
    { label: "Precinct", val: loc.precinct },
    { label: "County", val: loc.county_name },
    { label: "Municipality", val: loc.municipality },
    { label: "Municipal Subdistrict", val: loc.municipal_subdistrict },
    { label: "County Commission District", val: loc.county_commission_district },
    { label: "County Supervisor District", val: loc.county_supervisor_district },
    { label: "School District", val: loc.school_district },
    { label: "College District", val: loc.college_district },
    { label: "Judicial District", val: loc.judicial_district },
    { label: "FIPS Code", val: loc.fips_code },
  ];

  const geoFields = [
    { label: "Census Tract", val: loc.census_tract },
    { label: "Block Group", val: loc.census_block_group },
    { label: "Census Block", val: loc.census_block },
    { label: "DMA", val: loc.dma },
    { label: "Urbanicity", val: loc.urbanicity },
    { label: "Population Density", val: loc.population_density != null ? `${Number(loc.population_density).toLocaleString()}/sq mi` : null },
    { label: "Time Zone", val: loc.time_zone },
  ];

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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{address || "(No address)"}</h1>
        {loc.city && <p style={{ marginTop: 4, fontSize: 14, color: "var(--gg-text-dim, #6b7280)", margin: "4px 0 0" }}>
          {[loc.city, loc.state, loc.postal_code].filter(Boolean).join(", ")}
        </p>}
      </div>

      {/* Address Details */}
      {(() => {
        const addrFields = [
          { label: "House Number",   val: loc.house_number },
          { label: "Pre-Direction",  val: loc.pre_dir },
          { label: "Street Name",    val: loc.street_name },
          { label: "Street Suffix",  val: loc.street_suffix },
          { label: "Post-Direction", val: loc.post_dir },
          { label: "Unit / Apt",     val: loc.unit },
          { label: "Zip+4",          val: (loc as any).zip4 },
          { label: "Street Parity",  val: (loc as any).street_parity },
          { label: "Parcel ID",      val: (loc as any).parcel_id },
          { label: "Land Use",       val: (loc as any).land_use },
          { label: "Residential",    val: (loc as any).is_residential === true ? "Yes" : (loc as any).is_residential === false ? "No" : null },
          { label: "Type",           val: (loc as any).type },
          { label: "Common Name",    val: (loc as any).common_place_name },
          { label: "Place Name",     val: (loc as any).place_name },
          { label: "Subdivision",    val: (loc as any).subdivision },
          { label: "Council District", val: (loc as any).council_district },
        ];
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

      {loc.notes && (
        <div style={cardStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 8 }}>Notes</p>
          <p style={{ fontSize: 14, margin: 0, whiteSpace: "pre-wrap" }}>{loc.notes}</p>
        </div>
      )}
    </section>
  );
}
