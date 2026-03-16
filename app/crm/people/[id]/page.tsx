// app/crm/people/[id]/page.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import EditButton from "@/app/crm/_shared/EditButton";
import { updateRowAction } from "@/app/crm/_shared/mutations";

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

  // 1) Person
  const { data: person, error: pErr } = await sb
    .from("people")
    .select("id, first_name, last_name, email, phone, contact_type, notes, created_at, household_id")
    .eq("id", personId)
    .eq("tenant_id", tenant.id)
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

  const fullName = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "(Unnamed)";
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
            { name: "first_name", label: "First Name" },
            { name: "last_name", label: "Last Name" },
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

      {/* System */}
      {addedDate && (
        <p style={{ fontSize: 12, color: "var(--gg-text-dim, #9ca3af)", textAlign: "right" }}>
          Added {addedDate}
        </p>
      )}
    </section>
  );
}
