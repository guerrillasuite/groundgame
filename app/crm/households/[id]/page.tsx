// app/crm/households/[id]/page.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

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

  // 1) Household
  const { data: household, error: hhErr } = await sb
    .from("households")
    .select("id, name, location_id")
    .eq("id", hhId)
    .eq("tenant_id", tenant.id)
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

  // Style A: direct people.household_id
  const { data: directPeople } = await sb
    .from("people")
    .select("id, first_name, last_name, email, phone, contact_type")
    .eq("household_id", hhId)
    .eq("tenant_id", tenant.id);
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
      <Link href="/crm/households" style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }}>
        ← Households
      </Link>

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{household.name ?? "(Unnamed Household)"}</h1>
        {address && (
          <p style={{ marginTop: 4, fontSize: 14, color: "var(--gg-text-dim, #6b7280)" }}>{address}</p>
        )}
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

    </section>
  );
}
