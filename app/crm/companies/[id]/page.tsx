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

export default async function CompanyDetail({ params }: Params) {
  const { id: companyId } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  // Fetch company — only visible if this tenant has it linked
  const { data: company, error: cErr } = await sb
    .from("companies")
    .select("id, name, domain, phone, email, industry, status, location_id, presence, data_source, data_updated_at, tenant_companies!inner(tenant_id)")
    .eq("id", companyId)
    .eq("tenant_companies.tenant_id", tenant.id)
    .single();

  if (cErr || !company) {
    return (
      <section style={{ padding: 24 }}>
        <BackButton href="/crm/companies" label="← Companies" style={{ fontSize: 13, opacity: 0.6 }} />
        <p style={{ marginTop: 16, opacity: 0.6 }}>Company not found.</p>
      </section>
    );
  }

  // Location
  let address = "";
  if (company.location_id) {
    const { data: loc } = await sb
      .from("locations")
      .select("address_line1, city, state, postal_code, normalized_key")
      .eq("id", company.location_id)
      .single();
    if (loc) {
      const nk = (loc.normalized_key ?? "").trim();
      address = nk || [loc.address_line1, [loc.city, loc.state].filter(Boolean).join(", "), loc.postal_code].filter(Boolean).join(", ");
    }
  }

  // People linked to this company
  const { data: pcRows } = await sb
    .from("person_companies")
    .select("person_id")
    .eq("company_id", companyId);

  const personIds = (pcRows ?? []).map((r: any) => r.person_id).filter(Boolean);
  let linkedPeople: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }> = [];
  if (personIds.length > 0) {
    const { data: ppl } = await sb
      .from("people")
      .select("id, first_name, last_name, email, phone, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .in("id", personIds.slice(0, 200));
    linkedPeople = (ppl ?? []) as typeof linkedPeople;
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
    margin: 0,
    marginBottom: 2,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--gg-text, #111827)",
    margin: 0,
  };

  function Field({ label, val, href }: { label: string; val: string | null | undefined; href?: string }) {
    if (!val) return null;
    return (
      <div>
        <p style={labelStyle}>{label}</p>
        {href
          ? <a href={href} style={{ ...valueStyle, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>{val} →</a>
          : <p style={valueStyle}>{val}</p>
        }
      </div>
    );
  }

  const coreFields = [
    { label: "Industry",   val: company.industry },
    { label: "Domain",     val: company.domain },
    { label: "Phone",      val: company.phone },
    { label: "Email",      val: company.email },
    { label: "Status",     val: company.status },
    { label: "Presence",   val: company.presence },
    { label: "Address",    val: address || null, href: company.location_id ? `/crm/locations/${company.location_id}` : undefined },
  ].filter((f) => f.val);

  return (
    <section className="stack" style={{ maxWidth: 720 }}>
      <style>{`.co-member:hover { background: var(--gg-bg, #f9fafb) !important; }`}</style>
      <BackButton href="/crm/companies" label="← Companies" style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }} />

      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{company.name ?? "(Unnamed)"}</h1>
        {company.industry && (
          <p style={{ marginTop: 4, fontSize: 14, color: "var(--gg-text-dim, #6b7280)", margin: "4px 0 0" }}>
            {company.industry}
          </p>
        )}
      </div>

      {/* Core details */}
      {coreFields.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 20px" }}>
            {coreFields.map((f) => (
              <Field key={f.label} label={f.label} val={f.val} href={(f as any).href} />
            ))}
          </div>
        </div>
      )}

      {/* Linked people */}
      {linkedPeople.length > 0 && (
        <div style={cardStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 12 }}>
            People ({linkedPeople.length})
          </p>
          <div style={{ display: "grid", gap: 2 }}>
            {linkedPeople.map((m, i) => {
              const fullName = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "(Unnamed)";
              return (
                <a
                  key={m.id}
                  href={`/crm/people/${m.id}`}
                  className="co-member"
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
        </div>
      )}
    </section>
  );
}
