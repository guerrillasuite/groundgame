"use client";
import { useState, useEffect, useCallback } from "react";

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: 8,
  marginBottom: 12,
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid var(--gg-border, #e5e7eb)",
};

const btn = (danger = false): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  background: danger ? "#ef4444" : "var(--gg-primary, #2563eb)",
  color: "#fff",
});

const ghostBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid var(--gg-border, #e5e7eb)",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  background: "transparent",
  color: "inherit",
};

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--gg-text-dim, #9ca3af)",
  borderBottom: "1px solid var(--gg-border, #e5e7eb)",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid var(--gg-border, #e5e7eb)",
  verticalAlign: "middle",
};

const dim = <span style={{ color: "var(--gg-text-dim,#9ca3af)" }}>—</span>;

// ── Types ─────────────────────────────────────────────────────────────────────

type Group<T> = { key: string; label: string; suggestedKeepId: string; records: T[] };
type DedupeData<T> = { groups: Group<T>[]; total: number; totalGroups: number };

type PersonRecord = { id: string; first_name: string; last_name: string; email: string; phone: string; phone_cell: string; phone_landline: string; contact_type: string; lalvoteid: string; birth_date: string; gender: string; household_id: string | null; address: string };
type HouseholdRecord = { id: string; name: string; location_id: string | null; address: string; people_count: number };
type CompanyRecord = { id: string; name: string; domain: string; phone: string; email: string; industry: string; status: string; address: string };
type LocationRecord = { id: string; address_line1: string; city: string; state: string; postal_code: string; has_coords: boolean; normalized_key: string };
type OpportunityRecord = { id: string; title: string; stage: string; amount_cents: number | null; priority: string; due_at: string; source: string; contact_person_id: string | null; person_name: string };
type StopRecord = { id: string; stop_at: string; channel: string; result: string; notes: string; duration_sec: number | null; person_id: string | null; person_name: string };

// ── Merge type ────────────────────────────────────────────────────────────────

type MergeType = "people" | "households" | "companies" | "locations" | "opportunities" | "stops";

async function mergeRecords(type: MergeType, keepId: string, deleteIds: string[]) {
  const res = await fetch("/api/crm/dedupe/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, keepId, deleteIds }),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error ?? "Merge failed" };
  return { ok: true };
}

// ── Shared tab hook ───────────────────────────────────────────────────────────

function useDedupeTab<T>(type: MergeType) {
  const [data, setData] = useState<DedupeData<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keepMap, setKeepMap] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/dedupe?type=${type}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setData(json);
      const map: Record<string, string> = {};
      for (const g of json.groups ?? []) map[g.key] = g.suggestedKeepId;
      setKeepMap(map);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  async function mergeGroup(group: Group<T>) {
    const keepId = keepMap[group.key] ?? group.suggestedKeepId;
    const deleteIds = group.records.map((r: any) => r.id).filter((id: string) => id !== keepId);
    if (!deleteIds.length) return;
    setMerging((m) => ({ ...m, [group.key]: true }));
    const result = await mergeRecords(type, keepId, deleteIds);
    setMerging((m) => ({ ...m, [group.key]: false }));
    if (!result.ok) { alert(result.error); return; }
    setData((d) => d ? { ...d, groups: d.groups.filter((g) => g.key !== group.key), total: d.total - deleteIds.length } : d);
  }

  async function mergeAll(groups: Group<T>[]) {
    if (!groups.length) return;
    if (!confirm(`Merge all ${groups.length} groups? This cannot be undone.`)) return;
    for (const group of groups) await mergeGroup(group);
  }

  return { data, loading, error, keepMap, setKeepMap, merging, mergeGroup, mergeAll };
}

// ── Tab shell ─────────────────────────────────────────────────────────────────

function TabShell<T>({
  type, emptyMsg, noMergeAll, children,
}: {
  type: MergeType;
  emptyMsg: string;
  noMergeAll?: boolean;
  children: (props: ReturnType<typeof useDedupeTab<T>>) => React.ReactNode;
}) {
  const tab = useDedupeTab<T>(type);
  const { data, loading, error } = tab;

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--gg-text-dim,#9ca3af)" }}>Loading…</div>;
  if (error) return <div style={{ padding: 16, color: "#ef4444" }}>{error}</div>;
  if (!data?.groups.length) return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <p style={{ margin: 0, fontWeight: 600 }}>{emptyMsg}</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <p style={{ margin: 0, color: "var(--gg-text-dim,#9ca3af)", fontSize: 14 }}>
          Showing {data.groups.length.toLocaleString()} of {(data.totalGroups ?? data.groups.length).toLocaleString()} groups
          {(data.totalGroups ?? 0) > data.groups.length && (
            <span style={{ marginLeft: 8, color: "#f59e0b", fontWeight: 600 }}>· Merge this batch, then reload for more</span>
          )}
        </p>
        {!noMergeAll && <button onClick={() => tab.mergeAll(data.groups)} style={btn()}>Merge All</button>}
      </div>
      {children(tab)}
    </div>
  );
}

// ── People tab ────────────────────────────────────────────────────────────────

function PeopleTab() {
  return (
    <TabShell<PersonRecord> type="people" emptyMsg="All clean — no duplicate people found.">
      {({ data, keepMap, setKeepMap, merging, mergeGroup }) => (
        <>
          {data!.groups.map((group) => (
            <div key={group.key} style={card}>
              <div style={cardHeader}>
                <span style={{ fontWeight: 600 }}>{group.label} — {group.records.length} records</span>
                <button onClick={() => mergeGroup(group)} disabled={merging[group.key]} style={btn()}>
                  {merging[group.key] ? "Merging…" : "Merge"}
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Keep</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Voter ID</th>
                      <th style={thStyle}>Gender</th>
                      <th style={thStyle}>DOB</th>
                      <th style={thStyle}>Cell</th>
                      <th style={thStyle}>Landline</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((rec) => {
                      const isKeep = (keepMap[group.key] ?? group.suggestedKeepId) === rec.id;
                      return (
                        <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                          <td style={tdStyle}><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))} /></td>
                          <td style={tdStyle}>{rec.first_name} {rec.last_name}</td>
                          <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{rec.lalvoteid || dim}</td>
                          <td style={tdStyle}>{rec.gender || dim}</td>
                          <td style={tdStyle}>{rec.birth_date || dim}</td>
                          <td style={tdStyle}>{rec.phone_cell || dim}</td>
                          <td style={tdStyle}>{rec.phone_landline || dim}</td>
                          <td style={tdStyle}>{rec.email || dim}</td>
                          <td style={tdStyle}>{rec.contact_type || dim}</td>
                          <td style={tdStyle}>{rec.address || dim}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </TabShell>
  );
}

// ── Households tab ────────────────────────────────────────────────────────────

function HouseholdsTab() {
  return (
    <TabShell<HouseholdRecord> type="households" emptyMsg="All clean — no duplicate households found.">
      {({ data, keepMap, setKeepMap, merging, mergeGroup }) => (
        <>
          {data!.groups.map((group) => (
            <div key={group.key} style={card}>
              <div style={cardHeader}>
                <span style={{ fontWeight: 600 }}>{group.label} — {group.records.length} records</span>
                <button onClick={() => mergeGroup(group)} disabled={merging[group.key]} style={btn()}>
                  {merging[group.key] ? "Merging…" : "Merge"}
                </button>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Keep</th>
                    <th style={thStyle}>Household Name</th>
                    <th style={thStyle}>Address</th>
                    <th style={thStyle}>People</th>
                  </tr>
                </thead>
                <tbody>
                  {group.records.map((rec) => {
                    const isKeep = (keepMap[group.key] ?? group.suggestedKeepId) === rec.id;
                    return (
                      <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                        <td style={tdStyle}><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))} /></td>
                        <td style={tdStyle}>{rec.name || dim}</td>
                        <td style={tdStyle}>{rec.address || dim}</td>
                        <td style={tdStyle}>{rec.people_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </TabShell>
  );
}

// ── Companies tab ─────────────────────────────────────────────────────────────

function CompaniesTab() {
  return (
    <TabShell<CompanyRecord> type="companies" emptyMsg="All clean — no duplicate companies found.">
      {({ data, keepMap, setKeepMap, merging, mergeGroup }) => (
        <>
          {data!.groups.map((group) => (
            <div key={group.key} style={card}>
              <div style={cardHeader}>
                <span style={{ fontWeight: 600 }}>{group.label} — {group.records.length} records</span>
                <button onClick={() => mergeGroup(group)} disabled={merging[group.key]} style={btn()}>
                  {merging[group.key] ? "Merging…" : "Merge"}
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Keep</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Domain</th>
                      <th style={thStyle}>Phone</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Industry</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((rec) => {
                      const isKeep = (keepMap[group.key] ?? group.suggestedKeepId) === rec.id;
                      return (
                        <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                          <td style={tdStyle}><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))} /></td>
                          <td style={tdStyle}>{rec.name || dim}</td>
                          <td style={tdStyle}>{rec.domain || dim}</td>
                          <td style={tdStyle}>{rec.phone || dim}</td>
                          <td style={tdStyle}>{rec.email || dim}</td>
                          <td style={tdStyle}>{rec.industry || dim}</td>
                          <td style={tdStyle}>{rec.status || dim}</td>
                          <td style={tdStyle}>{rec.address || dim}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </TabShell>
  );
}

// ── Locations tab ─────────────────────────────────────────────────────────────

function LocationsTab() {
  return (
    <TabShell<LocationRecord> type="locations" emptyMsg="All clean — no duplicate locations found." noMergeAll>
      {({ data, keepMap, setKeepMap, merging, mergeGroup }) => (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#f59e0b" }}>
            Location merges move all households and walklist items — review each group carefully before merging.
          </p>
          {data!.groups.map((group) => (
            <div key={group.key} style={card}>
              <div style={cardHeader}>
                <span style={{ fontWeight: 600 }}>{group.label} — {group.records.length} records</span>
                <button onClick={() => mergeGroup(group)} disabled={merging[group.key]} style={btn()}>
                  {merging[group.key] ? "Merging…" : "Merge"}
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Keep</th>
                      <th style={thStyle}>Address</th>
                      <th style={thStyle}>City</th>
                      <th style={thStyle}>State</th>
                      <th style={thStyle}>ZIP</th>
                      <th style={thStyle}>Coords</th>
                      <th style={thStyle}>Normalized Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((rec) => {
                      const isKeep = (keepMap[group.key] ?? group.suggestedKeepId) === rec.id;
                      return (
                        <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                          <td style={tdStyle}><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))} /></td>
                          <td style={tdStyle}>{rec.address_line1 || dim}</td>
                          <td style={tdStyle}>{rec.city || dim}</td>
                          <td style={tdStyle}>{rec.state || dim}</td>
                          <td style={tdStyle}>{rec.postal_code || dim}</td>
                          <td style={tdStyle}>{rec.has_coords ? <span style={{ color: "#16a34a" }}>✓</span> : dim}</td>
                          <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{rec.normalized_key || dim}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </TabShell>
  );
}

// ── Opportunities tab ─────────────────────────────────────────────────────────

function OpportunitiesTab() {
  return (
    <TabShell<OpportunityRecord> type="opportunities" emptyMsg="All clean — no duplicate opportunities found.">
      {({ data, keepMap, setKeepMap, merging, mergeGroup }) => (
        <>
          {data!.groups.map((group) => (
            <div key={group.key} style={card}>
              <div style={cardHeader}>
                <span style={{ fontWeight: 600 }}>{group.label} — {group.records.length} records</span>
                <button onClick={() => mergeGroup(group)} disabled={merging[group.key]} style={btn()}>
                  {merging[group.key] ? "Merging…" : "Merge"}
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Keep</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Stage</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Priority</th>
                      <th style={thStyle}>Due</th>
                      <th style={thStyle}>Source</th>
                      <th style={thStyle}>Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((rec) => {
                      const isKeep = (keepMap[group.key] ?? group.suggestedKeepId) === rec.id;
                      return (
                        <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                          <td style={tdStyle}><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))} /></td>
                          <td style={tdStyle}>{rec.title || dim}</td>
                          <td style={tdStyle}>{rec.stage || dim}</td>
                          <td style={tdStyle}>{rec.amount_cents != null ? `$${(rec.amount_cents / 100).toLocaleString()}` : dim}</td>
                          <td style={tdStyle}>{rec.priority || dim}</td>
                          <td style={tdStyle}>{rec.due_at ? new Date(rec.due_at).toLocaleDateString() : dim}</td>
                          <td style={tdStyle}>{rec.source || dim}</td>
                          <td style={tdStyle}>{rec.person_name || dim}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </TabShell>
  );
}

// ── Stops tab ─────────────────────────────────────────────────────────────────

function StopsTab() {
  return (
    <TabShell<StopRecord> type="stops" emptyMsg="All clean — no duplicate stops found.">
      {({ data, keepMap, setKeepMap, merging, mergeGroup }) => (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--gg-text-dim,#9ca3af)" }}>
            Earliest stop is suggested to keep — duplicates are typically network retries.
          </p>
          {data!.groups.map((group) => (
            <div key={group.key} style={card}>
              <div style={cardHeader}>
                <span style={{ fontWeight: 600 }}>{group.label}</span>
                <button onClick={() => mergeGroup(group)} disabled={merging[group.key]} style={btn()}>
                  {merging[group.key] ? "Merging…" : "Merge"}
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Keep</th>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>Channel</th>
                      <th style={thStyle}>Result</th>
                      <th style={thStyle}>Duration</th>
                      <th style={thStyle}>Person</th>
                      <th style={thStyle}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((rec) => {
                      const isKeep = (keepMap[group.key] ?? group.suggestedKeepId) === rec.id;
                      return (
                        <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                          <td style={tdStyle}><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))} /></td>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: 12 }}>{rec.stop_at ? new Date(rec.stop_at).toLocaleString() : dim}</td>
                          <td style={tdStyle}>{rec.channel || dim}</td>
                          <td style={tdStyle}>{rec.result ? rec.result.replace(/_/g, " ") : dim}</td>
                          <td style={tdStyle}>{rec.duration_sec != null ? `${rec.duration_sec}s` : dim}</td>
                          <td style={tdStyle}>{rec.person_name || dim}</td>
                          <td style={tdStyle}>{rec.notes ? <span style={{ fontSize: 12, opacity: 0.7 }}>{rec.notes.slice(0, 60)}{rec.notes.length > 60 ? "…" : ""}</span> : dim}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </TabShell>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const TABS: { key: MergeType; label: string }[] = [
  { key: "people",        label: "People"        },
  { key: "households",    label: "Households"    },
  { key: "companies",     label: "Companies"     },
  { key: "locations",     label: "Locations"     },
  { key: "opportunities", label: "Opportunities" },
  { key: "stops",         label: "Stops"         },
];

export default function DedupePanel() {
  const [tab, setTab] = useState<MergeType>("people");

  const tabBtn = (t: MergeType): React.CSSProperties => ({
    ...ghostBtn,
    borderBottomColor: tab === t ? "var(--gg-primary,#2563eb)" : undefined,
    borderBottomWidth: tab === t ? 2 : 1,
    color: tab === t ? "var(--gg-primary,#2563eb)" : "inherit",
    fontWeight: tab === t ? 700 : 500,
  });

  return (
    <section className="stack">
      <div>
        <h2 style={{ margin: 0 }}>Deduplicate Data</h2>
        <p style={{ marginTop: 6, color: "var(--gg-text-dim,#9ca3af)", fontSize: 14 }}>
          Find and merge duplicate records across all CRM entities.
        </p>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--gg-border,#e5e7eb)", marginBottom: 4 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "people"        && <PeopleTab />}
      {tab === "households"    && <HouseholdsTab />}
      {tab === "companies"     && <CompaniesTab />}
      {tab === "locations"     && <LocationsTab />}
      {tab === "opportunities" && <OpportunitiesTab />}
      {tab === "stops"         && <StopsTab />}
    </section>
  );
}
