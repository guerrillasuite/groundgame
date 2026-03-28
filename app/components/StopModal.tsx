"use client";

/**
 * StopModal — shared modal for recording stops from anywhere.
 * Used in Doors (standalone + in-walklist) and Dials (standalone + in-walklist).
 *
 * Workflow:
 *  Step 1: Identify — address input (doors) or person search (dials)
 *  Step 1b: Auto-lookup existing CRM record, show contact card
 *  Step 2: Result + Notes + optional opportunity (progressive)
 */

import { useEffect, useRef, useState, useTransition } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type StopModalChannel = "doors" | "call";

export type StopModalMode =
  | { type: "standalone" }
  | { type: "walklist"; walklist_id: string };

type ContactCard = {
  location_id?: string | null;
  address?: string | null;
  household_name?: string | null;
  residents?: Array<{ id: string; name: string; phone?: string | null; email?: string | null }>;
  person_id?: string | null;
  person_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type StopModalProps = {
  channel: StopModalChannel;
  mode: StopModalMode;
  /** Called after a successful save with the new item idx (if in-walklist) */
  onSaved?: (opts?: { idx?: number; item_id?: string }) => void;
  onClose: () => void;
};

// ── Constants ────────────────────────────────────────────────────────────────

const DOOR_RESULTS = [
  { key: "not_home",      label: "Not Home",     positive: false },
  { key: "contact_made",  label: "Contacted",    positive: true },
  { key: "refused",       label: "Refused",      positive: false },
  { key: "wrong_address", label: "Wrong Address",positive: false },
  { key: "follow_up",     label: "Follow Up",    positive: true },
] as const;

const CALL_RESULTS = [
  { key: "connected",      label: "Connected",      positive: true },
  { key: "no_answer",      label: "No Answer",      positive: false },
  { key: "left_voicemail", label: "Left Voicemail", positive: false },
  { key: "bad_number",     label: "Bad Number",     positive: false },
  { key: "wrong_person",   label: "Wrong Person",   positive: false },
  { key: "call_back",      label: "Call Back",      positive: true },
  { key: "not_interested", label: "Not Interested", positive: false },
  { key: "do_not_call",    label: "Do Not Call",    positive: false },
] as const;

const STAGE_OPTIONS = [
  { value: "new",       label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal",  label: "Proposal" },
  { value: "won",       label: "Won" },
  { value: "lost",      label: "Lost" },
];

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed" as const, inset: 0,
    background: "rgba(0,0,0,.8)",
    zIndex: 9999,
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    padding: "0 0 0 0",
  },
  sheet: {
    background: "var(--gg-card, #10131b)",
    border: "1px solid var(--gg-border, #22283a)",
    borderRadius: "16px 16px 0 0",
    padding: "20px 20px 32px",
    width: "100%",
    maxWidth: 540,
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    maxHeight: "90vh",
    overflowY: "auto" as const,
  },
  label: { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13 },
  dim: { opacity: 0.6 },
  card: {
    background: "rgba(255,255,255,.04)",
    border: "1px solid var(--gg-border, #22283a)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
  },
};

// ── PersonSearch ─────────────────────────────────────────────────────────────

function PersonSearch({
  onSelect,
}: {
  onSelect: (p: { id: string; first_name: string; last_name: string; phone?: string | null; email?: string | null } | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(val: string) {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    if (!val.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/crm/people/search?q=${encodeURIComponent(val)}&limit=8`);
        const d = await r.json();
        setResults(Array.isArray(d?.rows) ? d.rows : []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
  }

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by name, email, phone…"
        autoFocus
        style={{ width: "100%", fontSize: 15 }}
      />
      {loading && <p style={{ fontSize: 12, opacity: 0.5, margin: "4px 0 0" }}>Searching…</p>}
      {results.length > 0 && (
        <div style={{
          background: "var(--gg-card, #10131b)",
          border: "1px solid var(--gg-border, #22283a)",
          borderRadius: 8, marginTop: 4, overflow: "hidden",
        }}>
          {results.map((p) => {
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "(unnamed)";
            return (
              <button
                key={p.id}
                type="button"
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 14px", fontSize: 14, background: "none",
                  border: "none", borderBottom: "1px solid var(--gg-border, #22283a)",
                  color: "inherit", cursor: "pointer",
                }}
                onClick={() => { setResults([]); setQ(name); onSelect(p); }}
              >
                <strong>{name}</strong>
                {p.phone && <span style={{ opacity: 0.6, marginLeft: 8 }}>{p.phone}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ContactCardView ───────────────────────────────────────────────────────────

function ContactCardView({ card }: { card: ContactCard }) {
  if (!card.address && !card.person_name) return null;
  return (
    <div style={S.card}>
      {card.address && (
        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{card.address}</p>
      )}
      {card.household_name && card.household_name !== card.address && (
        <p style={{ margin: "0 0 4px", opacity: 0.7, fontSize: 12 }}>{card.household_name}</p>
      )}
      {card.residents && card.residents.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {card.residents.map((r) => (
            <div key={r.id} style={{ fontSize: 12, display: "flex", gap: 12 }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              {r.phone && <span style={{ opacity: 0.6 }}>{r.phone}</span>}
              {r.email && <span style={{ opacity: 0.6 }}>{r.email}</span>}
            </div>
          ))}
        </div>
      )}
      {card.person_name && !card.residents?.length && (
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>{card.person_name}</span>
          {card.phone && <span style={{ opacity: 0.6, marginLeft: 10 }}>{card.phone}</span>}
          {card.email && <span style={{ opacity: 0.6, marginLeft: 10 }}>{card.email}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StopModal({ channel, mode, onSaved, onClose }: StopModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Step 1 — identity mode toggle (both channels support both)
  const [identifyBy, setIdentifyBy] = useState<"address" | "person">(
    channel === "call" ? "person" : "address"
  );

  // Step 1 — identity
  const [address, setAddress]     = useState("");
  const [city, setCity]           = useState("");
  const [state, setState_]        = useState("");
  const [zip, setZip]             = useState("");
  const [personId, setPersonId]   = useState<string | null>(null);

  // Step 1b — contact card (loaded after address/person confirmed)
  const [card, setCard]           = useState<ContactCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  // Step 2 — result + notes
  const [result, setResult]       = useState("");
  const [notes, setNotes]         = useState("");

  // Opportunity (progressive)
  const [showOpp, setShowOpp]     = useState(false);
  const [showOppExtra, setShowOppExtra] = useState(false);
  const [oppTitle, setOppTitle]   = useState("");
  const [oppStage, setOppStage]   = useState("new");
  const [oppAmount, setOppAmount] = useState("");
  const [oppDue, setOppDue]       = useState("");
  const [oppPriority, setOppPriority] = useState("");
  const [oppNotes_, setOppNotes_]  = useState("");

  const results = channel === "doors" ? DOOR_RESULTS : CALL_RESULTS;
  const positiveResult = results.find((r) => r.key === result)?.positive ?? false;

  // ── Address GPS fill ────────────────────────────────────────────────────────
  function fillGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      // GPS gives coords but not an address — just populate a placeholder the user can edit
      setAddress(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
    });
  }

  // ── Lookup existing CRM record ───────────────────────────────────────────────
  async function lookupAddress(addr: string, postal: string) {
    if (!addr.trim()) return;
    setCardLoading(true);
    try {
      const q = encodeURIComponent(`${addr} ${postal}`.trim());
      const r = await fetch(`/api/crm/locations/search?q=${q}&limit=3`);
      const d = await r.json();
      const rows = Array.isArray(d?.rows) ? d.rows : [];
      if (rows.length === 0) { setCard({ address: addr }); return; }

      const loc = rows[0];
      // Fetch household + residents
      const hRes = await fetch(`/api/crm/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "people", filters: [{ field: "city", op: "equals", value: loc.city ?? "" }] }),
      });
      // Simpler: just show location data from search result
      setCard({
        location_id: loc.id,
        address: loc.address,
        household_name: null,
        residents: [],
      });
    } catch { setCard({ address: addr }); }
    finally { setCardLoading(false); }
  }

  async function lookupPerson(pId: string, pData: any) {
    setCard({
      person_id: pId,
      person_name: [pData.first_name, pData.last_name].filter(Boolean).join(" "),
      phone: pData.phone ?? null,
      email: pData.email ?? null,
    });
    // Auto-fill opportunity title
    const name = [pData.first_name, pData.last_name].filter(Boolean).join(" ");
    if (name) setOppTitle(`Follow-up: ${name}`);
  }

  // ── Step navigation ──────────────────────────────────────────────────────────
  async function confirmIdentity() {
    setErr(null);
    if (identifyBy === "address" && !address.trim()) { setErr("Address is required"); return; }
    if (identifyBy === "person" && !personId) { setErr("Select a person first"); return; }

    if (identifyBy === "address" && address.trim()) {
      await lookupAddress(address, zip);
      setOppTitle(`Follow-up: ${address.trim()}`);
    }
    setStep(2);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  function submit() {
    if (!result) { setErr("Select a result first"); return; }
    setErr(null);

    const opportunity = showOpp ? {
      title: oppTitle || `Follow-up`,
      stage: oppStage || "new",
      amount_cents: oppAmount ? Math.round(parseFloat(oppAmount.replace(/[$,]/g, "")) * 100) : null,
      due_at: oppDue || null,
      priority: oppPriority || null,
      description: oppNotes_ || null,
    } : null;

    start(async () => {
      try {
        if (mode.type === "standalone") {
          const res = await fetch("/api/doors/stops/standalone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel,
              address_line1: identifyBy === "address" ? address : undefined,
              city: identifyBy === "address" ? city : undefined,
              state: identifyBy === "address" ? state : undefined,
              postal_code: identifyBy === "address" ? zip : undefined,
              person_id: personId ?? undefined,
              result,
              notes: notes || null,
              opportunity,
            }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? "Failed to save stop");
          onSaved?.();
          onClose();
        } else {
          // In-walklist: create walklist item first, then navigate
          const res = await fetch("/api/crm/walklist-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walklist_id: mode.walklist_id,
              address_line1: identifyBy === "address" ? address : undefined,
              city: identifyBy === "address" ? city : undefined,
              state: identifyBy === "address" ? state : undefined,
              postal_code: identifyBy === "address" ? zip : undefined,
              person_id: personId ?? undefined,
            }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? "Failed to add to list");
          onSaved?.({ idx: d.idx, item_id: d.item_id });
          onClose();
        }
      } catch (e: any) {
        setErr(e?.message ?? "Failed to save");
      }
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        .gg-result-btn:hover { background: var(--gg-primary, #2563eb) !important; color: #fff !important; border-color: var(--gg-primary, #2563eb) !important; }
      `}</style>
      <div style={S.sheet}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {channel === "doors" ? "Record Stop" : "Log Call"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, opacity: 0.5, cursor: "pointer", color: "inherit" }}
          >
            ×
          </button>
        </div>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <>
            {/* Identity mode toggle */}
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.06)", borderRadius: 8, padding: 3 }}>
              {(["person", "address"] as const).map((mode_) => (
                <button
                  key={mode_}
                  type="button"
                  onClick={() => { setIdentifyBy(mode_); setErr(null); }}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 6, border: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: identifyBy === mode_ ? 600 : 400,
                    background: identifyBy === mode_ ? "var(--gg-primary, #2563eb)" : "transparent",
                    color: identifyBy === mode_ ? "#fff" : "inherit",
                  }}
                >
                  {mode_ === "person" ? "👤 By Person" : "📍 By Address"}
                </button>
              ))}
            </div>

            {identifyBy === "address" ? (
              <>
                <label style={S.label}>
                  <span style={S.dim}>Street Address</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main St"
                      style={{ flex: 1, fontSize: 15 }}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") confirmIdentity(); }}
                    />
                    <button
                      type="button"
                      title="Use GPS location"
                      onClick={fillGps}
                      style={{
                        background: "none", border: "1px solid var(--gg-border,#22283a)",
                        borderRadius: 6, padding: "0 10px", cursor: "pointer",
                        color: "inherit", fontSize: 16,
                      }}
                    >
                      📍
                    </button>
                  </div>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ ...S.label, flex: 2 }}>
                    <span style={S.dim}>City</span>
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Springfield" />
                  </label>
                  <label style={{ ...S.label, flex: 1 }}>
                    <span style={S.dim}>State</span>
                    <input value={state} onChange={(e) => setState_(e.target.value)} placeholder="IL" maxLength={2} />
                  </label>
                  <label style={{ ...S.label, flex: 1 }}>
                    <span style={S.dim}>Zip</span>
                    <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="62701" maxLength={10} />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label style={{ ...S.label, marginBottom: 2 }}>
                  <span style={S.dim}>Search for a person</span>
                </label>
                <PersonSearch
                  onSelect={(p) => {
                    if (p) { setPersonId(p.id); lookupPerson(p.id, p); }
                    else { setPersonId(null); setCard(null); }
                  }}
                />
              </>
            )}

            {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmIdentity}>
                {cardLoading ? "Looking up…" : "Continue →"}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <>
            {/* Contact card */}
            {card && <ContactCardView card={card} />}
            {!card && (
              <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>
                No existing record — will be created on save
              </p>
            )}

            {/* Result */}
            {channel === "doors" ? (
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, ...S.dim }}>Result</p>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {DOOR_RESULTS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className="gg-result-btn"
                      onClick={() => { setResult(r.key); setShowOpp(false); }}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 20,
                        border: result === r.key
                          ? "2px solid var(--gg-primary, #2563eb)"
                          : "1px solid var(--gg-border, #22283a)",
                        background: result === r.key ? "var(--gg-primary, #2563eb)" : "none",
                        color: result === r.key ? "#fff" : "inherit",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: result === r.key ? 600 : 400,
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label style={S.label}>
                <span style={S.dim}>Call Result</span>
                <select
                  value={result}
                  onChange={(e) => { setResult(e.target.value); setShowOpp(false); }}
                  style={{ fontSize: 15 }}
                >
                  <option value="">— select result —</option>
                  {CALL_RESULTS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Notes */}
            <label style={S.label}>
              <span style={S.dim}>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes…"
                style={{ resize: "vertical" }}
              />
            </label>

            {/* Opportunity — progressive disclosure */}
            {result && positiveResult && !showOpp && (
              <button
                type="button"
                onClick={() => setShowOpp(true)}
                style={{
                  background: "none",
                  border: "1px dashed var(--gg-border, #22283a)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: "var(--gg-primary, #2563eb)",
                  cursor: "pointer",
                  fontSize: 13,
                  textAlign: "left" as const,
                }}
              >
                + Create Opportunity
              </button>
            )}

            {showOpp && (
              <div style={{
                background: "rgba(37,99,235,.06)",
                border: "1px solid rgba(37,99,235,.25)",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                flexDirection: "column" as const,
                gap: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Opportunity</span>
                  <button
                    type="button"
                    onClick={() => { setShowOpp(false); setShowOppExtra(false); }}
                    style={{ background: "none", border: "none", fontSize: 16, opacity: 0.5, cursor: "pointer", color: "inherit" }}
                  >
                    ×
                  </button>
                </div>

                <label style={S.label}>
                  <span style={S.dim}>Title</span>
                  <input value={oppTitle} onChange={(e) => setOppTitle(e.target.value)} placeholder="Follow-up" />
                </label>

                <label style={S.label}>
                  <span style={S.dim}>Stage</span>
                  <select value={oppStage} onChange={(e) => setOppStage(e.target.value)}>
                    {STAGE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>

                {!showOppExtra && (
                  <button
                    type="button"
                    onClick={() => setShowOppExtra(true)}
                    style={{ background: "none", border: "none", color: "var(--gg-primary,#2563eb)", fontSize: 12, cursor: "pointer", padding: 0, textAlign: "left" as const }}
                  >
                    More options ›
                  </button>
                )}

                {showOppExtra && (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ ...S.label, flex: 1 }}>
                        <span style={S.dim}>Value ($)</span>
                        <input type="number" min="0" step="0.01" value={oppAmount} onChange={(e) => setOppAmount(e.target.value)} placeholder="0.00" />
                      </label>
                      <label style={{ ...S.label, flex: 1 }}>
                        <span style={S.dim}>Due Date</span>
                        <input type="date" value={oppDue} onChange={(e) => setOppDue(e.target.value)} />
                      </label>
                    </div>
                    <label style={S.label}>
                      <span style={S.dim}>Priority</span>
                      <select value={oppPriority} onChange={(e) => setOppPriority(e.target.value)}>
                        <option value="">—</option>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label style={S.label}>
                      <span style={S.dim}>Notes</span>
                      <textarea value={oppNotes_} onChange={(e) => setOppNotes_(e.target.value)} rows={2} style={{ resize: "vertical" }} />
                    </label>
                  </>
                )}
              </div>
            )}

            {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <button type="button" className="btn" onClick={() => { setStep(1); setErr(null); }}>← Back</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || !result}>
                {pending ? "Saving…" : mode.type === "walklist" ? "Add & Open →" : "Save Stop"}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
