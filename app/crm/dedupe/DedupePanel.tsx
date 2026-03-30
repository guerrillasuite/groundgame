"use client";
import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type PersonRecord = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  phone_cell: string;
  phone_landline: string;
  contact_type: string;
  lalvoteid: string;
  birth_date: string;
  gender: string;
  household_id: string | null;
  address: string;
};

type HouseholdRecord = {
  id: string;
  name: string;
  location_id: string;
  address: string;
  people_count: number;
};

type Group<T> = {
  key: string;
  label: string;
  suggestedKeepId: string;
  records: T[];
};

type DedupeData<T> = {
  groups: Group<T>[];
  total: number;
};

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

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

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

// ── Merge helper ──────────────────────────────────────────────────────────────

async function mergeRecords(
  type: "people" | "households",
  keepId: string,
  deleteIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/crm/dedupe/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, keepId, deleteIds }),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error ?? "Merge failed" };
  return { ok: true };
}

// ── People tab ────────────────────────────────────────────────────────────────

function PeopleTab() {
  const [data, setData] = useState<DedupeData<PersonRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keepMap, setKeepMap] = useState<Record<string, string>>({}); // groupKey → keepId
  const [merging, setMerging] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/dedupe?type=people");
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setData(json);
      // Pre-populate keepMap with suggested IDs
      const map: Record<string, string> = {};
      for (const g of json.groups ?? []) map[g.key] = g.suggestedKeepId;
      setKeepMap(map);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function mergeGroup(group: Group<PersonRecord>) {
    const keepId = keepMap[group.key] ?? group.suggestedKeepId;
    const deleteIds = group.records.map((r) => r.id).filter((id) => id !== keepId);
    setMerging((m) => ({ ...m, [group.key]: true }));
    const result = await mergeRecords("people", keepId, deleteIds);
    setMerging((m) => ({ ...m, [group.key]: false }));
    if (!result.ok) { alert(result.error); return; }
    setData((d) => d ? { ...d, groups: d.groups.filter((g) => g.key !== group.key), total: d.total - deleteIds.length } : d);
  }

  async function mergeAll() {
    if (!data?.groups.length) return;
    if (!confirm(`Merge all ${data.groups.length} groups? This will delete ${data.total} duplicate records.`)) return;
    for (const group of data.groups) await mergeGroup(group);
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--gg-text-dim,#9ca3af)" }}>Loading…</div>;
  if (error) return <div style={{ padding: 16, color: "#ef4444" }}>{error}</div>;
  if (!data?.groups.length) return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <p style={{ margin: 0, fontWeight: 600 }}>All clean — no duplicate people found.</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <p style={{ margin: 0, color: "var(--gg-text-dim,#9ca3af)", fontSize: 14 }}>
          {data.groups.length} groups &middot; {data.total} duplicate records
        </p>
        <button onClick={mergeAll} style={btn()}>Merge All</button>
      </div>

      {data.groups.map((group) => (
        <div key={group.key} style={card}>
          <div style={cardHeader}>
            <span style={{ fontWeight: 600 }}>{group.label} — {group.records.length} records</span>
            <button
              onClick={() => mergeGroup(group)}
              disabled={merging[group.key]}
              style={btn()}
            >
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
                  const dim = <span style={{ color: "var(--gg-text-dim,#9ca3af)" }}>—</span>;
                  return (
                    <tr key={rec.id} style={{ background: isKeep ? "rgba(59,130,246,0.08)" : undefined }}>
                      <td style={tdStyle}>
                        <input
                          type="radio"
                          name={`keep-${group.key}`}
                          checked={isKeep}
                          onChange={() => setKeepMap((m) => ({ ...m, [group.key]: rec.id }))}
                        />
                      </td>
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
    </div>
  );
}

// ── Households tab ────────────────────────────────────────────────────────────

function HouseholdsTab() {
  const [data, setData] = useState<DedupeData<HouseholdRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [merging, setMerging] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/dedupe?type=households");
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setData(json);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function mergeGroup(group: Group<HouseholdRecord>) {
    const keepId = group.suggestedKeepId;
    const deleteIds = group.records.map((r) => r.id).filter((id) => id !== keepId);
    setMerging((m) => ({ ...m, [group.key]: true }));
    const result = await mergeRecords("households", keepId, deleteIds);
    setMerging((m) => ({ ...m, [group.key]: false }));
    if (!result.ok) { alert(result.error); return; }
    setData((d) => d ? { ...d, groups: d.groups.filter((g) => g.key !== group.key), total: d.total - deleteIds.length } : d);
  }

  async function mergeAll() {
    if (!data?.groups.length) return;
    if (!confirm(`Merge all ${data.groups.length} duplicate household groups?`)) return;
    for (const group of data.groups) await mergeGroup(group);
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--gg-text-dim,#9ca3af)" }}>Loading…</div>;
  if (error) return <div style={{ padding: 16, color: "#ef4444" }}>{error}</div>;
  if (!data?.groups.length) return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <p style={{ margin: 0, fontWeight: 600 }}>All clean — no duplicate households found.</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <p style={{ margin: 0, color: "var(--gg-text-dim,#9ca3af)", fontSize: 14 }}>
          {data.groups.length} groups &middot; {data.total} duplicate households
        </p>
        <button onClick={mergeAll} style={btn()}>Merge All</button>
      </div>

      {data.groups.map((group) => (
        <div key={group.key} style={card}>
          <div style={cardHeader}>
            <span style={{ fontWeight: 600 }}>{group.label}</span>
            <button
              onClick={() => mergeGroup(group)}
              disabled={merging[group.key]}
              style={btn()}
            >
              {merging[group.key] ? "Merging…" : `Merge ${group.records.length} → 1`}
            </button>
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Primary</th>
                <th style={thStyle}>Household Name</th>
                <th style={thStyle}>People</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map((rec, i) => (
                <tr key={rec.id} style={{ background: i === 0 ? "rgba(59,130,246,0.08)" : undefined }}>
                  <td style={tdStyle}>
                    {i === 0
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,0.1)", borderRadius: 4, padding: "2px 7px" }}>KEEP</span>
                      : <span style={{ fontSize: 11, color: "var(--gg-text-dim,#9ca3af)" }}>merge</span>}
                  </td>
                  <td style={tdStyle}>{rec.name || <span style={{ color: "var(--gg-text-dim,#9ca3af)" }}>(unnamed)</span>}</td>
                  <td style={tdStyle}>{rec.people_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Tab = "people" | "households";

export default function DedupePanel() {
  const [tab, setTab] = useState<Tab>("people");

  const tabBtn = (t: Tab): React.CSSProperties => ({
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
          Find and merge duplicate people and households.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--gg-border,#e5e7eb)", marginBottom: 4 }}>
        <button onClick={() => setTab("people")} style={tabBtn("people")}>Duplicate People</button>
        <button onClick={() => setTab("households")} style={tabBtn("households")}>Duplicate Households</button>
      </div>

      {tab === "people" && <PeopleTab />}
      {tab === "households" && <HouseholdsTab />}
    </section>
  );
}
