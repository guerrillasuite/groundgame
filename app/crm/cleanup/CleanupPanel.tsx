"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type CleanupStats = {
  missingMiddleInitial: number;
  missingCoordinates: number;
  duplicatePeopleGroups: number;
  duplicateHouseholdGroups: number;
  malformedPhones: number;
  malformedEmails: number;
  allCapsNames: number;
  blankRecords: number;
  householdsNeedingNameRebuild: number;
  orphanedLocations: number;
  likelyMovers: number;
  addressesToNormalize: number;
  duplicateCompanyGroups: number;
  duplicateLocationGroups: number;
  duplicateOpportunityGroups: number;
  duplicateStopGroups: number;
};

type CardResult = { label: string; color?: string } | null;

// ── helpers ───────────────────────────────────────────────────────────────────

async function callAction(url: string, method: "POST" | "DELETE" | "GET"): Promise<any> {
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 16px",
        borderRadius: 8,
        background: warn && value > 0 ? "rgba(251,191,36,0.12)" : "var(--gg-surface, rgba(255,255,255,0.05))",
        border: `1px solid ${warn && value > 0 ? "#fbbf24" : "rgba(255,255,255,0.08)"}`,
        minWidth: 90,
        gap: 2,
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{value.toLocaleString()}</span>
      <span style={{ fontSize: 11, opacity: 0.6, textAlign: "center" }}>{label}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "24px 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>
      {children}
    </p>
  );
}

function ActionCard({
  title,
  description,
  stat,
  statColor,
  buttonLabel,
  buttonDanger,
  onAction,
  result,
  loading,
  linkHref,
  linkLabel,
  previewContent,
  confirmMessage,
}: {
  title: string;
  description: string;
  stat?: string;
  statColor?: string;
  buttonLabel?: string;
  buttonDanger?: boolean;
  onAction?: () => void;
  result?: CardResult;
  loading?: boolean;
  linkHref?: string;
  linkLabel?: string;
  previewContent?: React.ReactNode;
  confirmMessage?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (confirmMessage && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onAction?.();
  }

  return (
    <div
      style={{
        background: "var(--gg-surface, rgba(255,255,255,0.04))",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{title}</p>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.65 }}>{description}</p>

      {stat && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: statColor ?? "#94a3b8" }}>
          {stat}
        </p>
      )}

      {previewContent}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
        {buttonLabel && onAction && (
          confirming ? (
            <>
              <span style={{ fontSize: 13, opacity: 0.8 }}>{confirmMessage}</span>
              <button
                onClick={handleClick}
                disabled={loading}
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Running…" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer", color: "inherit" }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleClick}
              disabled={loading}
              style={{
                background: buttonDanger ? "#dc2626" : "var(--gg-primary, #2563eb)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              {loading ? "Running…" : buttonLabel}
            </button>
          )
        )}

        {linkHref && linkLabel && (
          <Link
            href={linkHref}
            style={{ fontSize: 13, color: "var(--gg-primary, #2563eb)", fontWeight: 600, textDecoration: "none" }}
          >
            {linkLabel} →
          </Link>
        )}

        {result && (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: result.color ?? "#16a34a" }}>
            {result.label}
          </p>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function CleanupPanel() {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Per-card loading and result states
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, CardResult>>({});

  // Orphaned locations preview
  const [orphanSample, setOrphanSample] = useState<{ id: string; address_line1: string; city: string; state: string }[]>([]);

  // Likely movers preview
  const [moverSample, setMoverSample] = useState<{ id: string; first_name: string; last_name: string; length_of_residence: number | null; moved_from_state: string | null }[]>([]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/cleanup/stats");
      const data = await res.json();
      setStats(data);

      const [orphanRes, moverRes] = await Promise.all([
        fetch("/api/crm/cleanup/orphaned-locations"),
        fetch("/api/crm/cleanup/likely-movers"),
      ]);
      if (orphanRes.ok) setOrphanSample((await orphanRes.json()).sample ?? []);
      if (moverRes.ok) setMoverSample((await moverRes.json()).sample ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function runCard(key: string, url: string, method: "POST" | "DELETE", buildResult: (data: any) => CardResult) {
    setRunning((r) => ({ ...r, [key]: true }));
    setResults((r) => ({ ...r, [key]: null }));
    try {
      const data = await callAction(url, method);
      setResults((r) => ({ ...r, [key]: buildResult(data) }));
      fetchStats();
    } catch (e: any) {
      setResults((r) => ({ ...r, [key]: { label: `Error: ${e.message}`, color: "#dc2626" } }));
    } finally {
      setRunning((r) => ({ ...r, [key]: false }));
    }
  }

  // ── render states ──────────────────────────────────────────────────────────

  if (!stats && loading) {
    return (
      <div style={{ maxWidth: 720, margin: "60px auto", padding: "0 24px", opacity: 0.6 }}>
        Loading data quality stats…
      </div>
    );
  }

  const s = stats ?? ({} as CleanupStats);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Data Cleanup</h1>
        <p style={{ margin: "4px 0 0", opacity: 0.55, fontSize: 13 }}>
          Admin tools to improve data quality across your CRM.
        </p>
      </div>

      {/* ── Stat pills ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <StatPill label="Missing initials" value={s.missingMiddleInitial ?? 0} warn />
        <StatPill label="Ungeocoded" value={s.missingCoordinates ?? 0} warn />
        <StatPill label="Dup people groups" value={s.duplicatePeopleGroups ?? 0} warn />
        <StatPill label="Dup households" value={s.duplicateHouseholdGroups ?? 0} warn />
        <StatPill label="Phone cleanup" value={s.malformedPhones ?? 0} />
        <StatPill label="Email cleanup" value={s.malformedEmails ?? 0} />
        <StatPill label="ALL CAPS names" value={s.allCapsNames ?? 0} warn />
        <StatPill label="Blank records" value={s.blankRecords ?? 0} warn />
        <StatPill label="Orphaned locations" value={s.orphanedLocations ?? 0} />
        <StatPill label="Likely movers" value={s.likelyMovers ?? 0} />
        <StatPill label="Addresses unparsed" value={s.addressesToNormalize ?? 0} warn />
        <StatPill label="Dup companies" value={s.duplicateCompanyGroups ?? 0} warn />
        <StatPill label="Dup locations" value={s.duplicateLocationGroups ?? 0} warn />
        <StatPill label="Dup opportunities" value={s.duplicateOpportunityGroups ?? 0} warn />
        <StatPill label="Dup stops" value={s.duplicateStopGroups ?? 0} />
      </div>

      {/* ── People Data section ── */}
      <SectionLabel>People Data</SectionLabel>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ActionCard
          title="Fill Middle Initials"
          description="Set middle_initial to the first character of middle_name for people who have a middle name but no initial."
          stat={s.missingMiddleInitial > 0 ? `${s.missingMiddleInitial.toLocaleString()} people need this fix` : "All initials are filled ✓"}
          statColor={s.missingMiddleInitial > 0 ? "#fbbf24" : "#16a34a"}
          buttonLabel={`Fill ${(s.missingMiddleInitial ?? 0).toLocaleString()} Initials`}
          onAction={() => runCard("fillInitial", "/api/crm/cleanup/fill-middle-initial", "POST", (d) => ({ label: `✓ Updated ${d.updated} records` }))}
          loading={running.fillInitial}
          result={results.fillInitial}
        />

        <ActionCard
          title="Normalize Phone Numbers"
          description="Reformat phone numbers to (XXX) XXX-XXXX. Strips country codes, non-digit characters. Numbers that can't be normalized are cleared."
          stat={s.malformedPhones > 0 ? `${s.malformedPhones.toLocaleString()} people have phone data` : "No phone data found"}
          buttonLabel="Normalize Phones"
          onAction={() => runCard("normalizePhones", "/api/crm/cleanup/normalize-phones", "POST", (d) => ({ label: `✓ Updated ${d.updated} · Cleared ${d.cleared} invalid` }))}
          loading={running.normalizePhones}
          result={results.normalizePhones}
        />

        <ActionCard
          title="Normalize Emails"
          description="Lowercase and trim all email addresses. Fixes mixed-case emails like 'John@Example.COM'."
          stat={s.malformedEmails > 0 ? `${s.malformedEmails.toLocaleString()} emails need normalizing` : "All emails normalized ✓"}
          statColor={s.malformedEmails > 0 ? "#fbbf24" : "#16a34a"}
          buttonLabel={`Normalize ${(s.malformedEmails ?? 0).toLocaleString()} Emails`}
          onAction={() => runCard("normalizeEmails", "/api/crm/cleanup/normalize-emails", "POST", (d) => ({ label: `✓ Updated ${d.updated} records` }))}
          loading={running.normalizeEmails}
          result={results.normalizeEmails}
        />

        <ActionCard
          title="Fix Name Capitalization"
          description="Convert ALL-CAPS first and last names to proper title case. Handles smart patterns: McDonald, O'Brien, hyphenated names. Only applies to fully uppercase names."
          stat={s.allCapsNames > 0 ? `${s.allCapsNames.toLocaleString()} names are ALL-CAPS` : "No all-caps names found ✓"}
          statColor={s.allCapsNames > 0 ? "#fbbf24" : "#16a34a"}
          buttonLabel={`Fix ${(s.allCapsNames ?? 0).toLocaleString()} Names`}
          onAction={() => runCard("fixCaps", "/api/crm/cleanup/fix-capitalization", "POST", (d) => ({ label: `✓ Updated ${d.updated} records` }))}
          loading={running.fixCaps}
          result={results.fixCaps}
        />

        <ActionCard
          title="Deactivate Blank Records"
          description="Soft-deactivate people who have no name, email, or phone number. Records are marked inactive (not deleted) — they can be reactivated."
          stat={s.blankRecords > 0 ? `${s.blankRecords.toLocaleString()} blank records found` : "No blank records ✓"}
          statColor={s.blankRecords > 0 ? "#ef4444" : "#16a34a"}
          buttonLabel={`Deactivate ${(s.blankRecords ?? 0).toLocaleString()} Blank Records`}
          buttonDanger
          confirmMessage={`Deactivate ${s.blankRecords} blank records? They won't be deleted and can be reactivated.`}
          onAction={() => runCard("removeBlanks", "/api/crm/cleanup/remove-blank-records", "POST", (d) => ({ label: `✓ Deactivated ${d.deactivated} records` }))}
          loading={running.removeBlanks}
          result={results.removeBlanks}
        />
      </div>

      {/* ── Household & Location Data section ── */}
      <SectionLabel>Household &amp; Location Data</SectionLabel>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ActionCard
          title="Geocode Missing Locations"
          description="Fetch coordinates for addresses with no lat/lon using the free US Census Geocoder. Processes 50 addresses per run — run again if more remain."
          stat={s.missingCoordinates > 0 ? `${s.missingCoordinates.toLocaleString()} addresses have no coordinates` : "All addresses geocoded ✓"}
          statColor={s.missingCoordinates > 0 ? "#fbbf24" : "#16a34a"}
          buttonLabel="Run Geocode Batch"
          onAction={() => runCard("geocode", "/api/crm/locations/geocode", "POST", (d) => ({ label: `✓ Geocoded ${d.geocoded} · Failed ${d.failed} · Skipped ${d.skipped}` }))}
          loading={running.geocode}
          result={results.geocode}
        />

        <ActionCard
          title="Normalize Addresses"
          description="Fix capitalization (ALL CAPS / all lowercase), parse address into street number and street name, and refresh the dedup key. Enables filtering by street name in walklists."
          stat={
            (s.addressesToNormalize ?? 0) > 0
              ? `${s.addressesToNormalize.toLocaleString()} addresses need normalizing`
              : "All addresses normalized ✓"
          }
          statColor={(s.addressesToNormalize ?? 0) > 0 ? "#fbbf24" : "#16a34a"}
          buttonLabel={`Normalize ${(s.addressesToNormalize ?? 0).toLocaleString()} Addresses`}
          onAction={() =>
            runCard("normalizeAddresses", "/api/crm/cleanup/normalize-addresses", "POST", (d) => ({
              label: `✓ Normalized ${d.updated} addresses`,
            }))
          }
          loading={running.normalizeAddresses}
          result={results.normalizeAddresses}
        />

        <ActionCard
          title="Rebuild Household Names"
          description="Recalculate household names from member last names. Single last name → 'Smith Family'. Two → 'Smith & Jones'. Three+ → 'Smith, Jones & Brown'."
          stat={`${(s.householdsNeedingNameRebuild ?? 0).toLocaleString()} households`}
          buttonLabel="Rebuild Names"
          onAction={() => runCard("rebuildNames", "/api/crm/cleanup/rebuild-household-names", "POST", (d) => ({ label: `✓ Updated ${d.updated} households` }))}
          loading={running.rebuildNames}
          result={results.rebuildNames}
        />

        <ActionCard
          title="Find Orphaned Locations"
          description="Locations that are not linked to any household for your organization — typically leftover GIS data from imports. Preview before deleting."
          stat={s.orphanedLocations > 0 ? `${s.orphanedLocations.toLocaleString()} orphaned locations` : "No orphaned locations ✓"}
          statColor={s.orphanedLocations > 0 ? "#fbbf24" : "#16a34a"}
          buttonLabel={s.orphanedLocations > 0 ? `Delete ${s.orphanedLocations.toLocaleString()} Orphaned Locations` : undefined}
          buttonDanger
          confirmMessage={`Permanently delete ${s.orphanedLocations} locations? This cannot be undone.`}
          onAction={s.orphanedLocations > 0 ? () => runCard("orphans", "/api/crm/cleanup/orphaned-locations", "DELETE", (d) => ({ label: `✓ Deleted ${d.deleted} locations` })) : undefined}
          loading={running.orphans}
          result={results.orphans}
          previewContent={
            orphanSample.length > 0 ? (
              <div style={{ marginTop: 4 }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, opacity: 0.55 }}>Sample (up to 5):</p>
                {orphanSample.map((l) => (
                  <p key={l.id} style={{ margin: "1px 0", fontSize: 12, opacity: 0.7 }}>
                    {[l.address_line1, l.city, l.state].filter(Boolean).join(", ")}
                  </p>
                ))}
              </div>
            ) : null
          }
        />

        <ActionCard
          title="Detect Likely Movers"
          description="People who recently moved based on length of residence (≤12 months) or a recorded prior state. Report only — useful for targeting re-engagement outreach."
          stat={s.likelyMovers > 0 ? `${s.likelyMovers.toLocaleString()} likely movers detected` : "No likely movers found"}
          linkHref="/crm/people"
          linkLabel="View People"
          previewContent={
            moverSample.length > 0 ? (
              <div style={{ marginTop: 4 }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, opacity: 0.55 }}>Sample:</p>
                {moverSample.map((p) => (
                  <p key={p.id} style={{ margin: "1px 0", fontSize: 12, opacity: 0.7 }}>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ")}
                    {p.moved_from_state ? ` — moved from ${p.moved_from_state}` : ""}
                    {p.length_of_residence !== null ? ` — ${p.length_of_residence} mo. residence` : ""}
                  </p>
                ))}
              </div>
            ) : null
          }
        />

        <ActionCard
          title="Dedupe Records"
          description="Find and merge duplicate people or households. Duplicate detection is based on matching names or shared addresses."
          stat={[
            `${(s.duplicatePeopleGroups ?? 0).toLocaleString()} people`,
            `${(s.duplicateHouseholdGroups ?? 0).toLocaleString()} households`,
            `${(s.duplicateCompanyGroups ?? 0).toLocaleString()} companies`,
            `${(s.duplicateLocationGroups ?? 0).toLocaleString()} locations`,
            `${(s.duplicateOpportunityGroups ?? 0).toLocaleString()} opportunities`,
            `${(s.duplicateStopGroups ?? 0).toLocaleString()} stops`,
          ].join(" · ")}
          statColor={(s.duplicatePeopleGroups ?? 0) + (s.duplicateHouseholdGroups ?? 0) + (s.duplicateCompanyGroups ?? 0) + (s.duplicateLocationGroups ?? 0) + (s.duplicateOpportunityGroups ?? 0) > 0 ? "#fbbf24" : "#16a34a"}
          linkHref="/crm/dedupe"
          linkLabel="Go to Dedupe"
        />
      </div>
    </div>
  );
}
