"use client";

import { useEffect, useState } from "react";

const S = {
  bg:     "rgb(10 13 20)",
  card:   "rgb(20 25 38)",
  border: "rgba(255,255,255,.08)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  accent: "var(--gg-primary, #2563eb)",
} as const;

type Slot = { start: string; end: string };

function fmtTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit",
  });
}

function fmtDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric",
  });
}

function fmtDateShort(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
  });
}

function groupSlotsByDate(slots: Slot[], tz: string): { dateLabel: string; dateKey: string; slots: Slot[] }[] {
  const map = new Map<string, { dateLabel: string; slots: Slot[] }>();
  for (const slot of slots) {
    const key   = new Date(slot.start).toLocaleDateString("en-CA", { timeZone: tz });
    const label = fmtDateShort(slot.start, tz);
    if (!map.has(key)) map.set(key, { dateLabel: label, slots: [] });
    map.get(key)!.slots.push(slot);
  }
  return Array.from(map.entries()).map(([dateKey, v]) => ({ dateKey, ...v }));
}

export default function BookingClient({
  slug, title, description, durationMinutes, timezone, hostName,
}: {
  slug:            string;
  title:           string;
  description:     string | null;
  durationMinutes: number;
  timezone:        string;
  hostName:        string;
}) {
  const [slots, setSlots]             = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [notes, setNotes]             = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [confirmed, setConfirmed]     = useState<{ start: string; end: string; msg: string | null } | null>(null);
  const [error, setError]             = useState("");

  useEffect(() => {
    fetch(`/api/booking/${slug}/availability?days=28`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  }, [slug]);

  async function handleConfirm() {
    if (!selectedSlot || !name.trim() || !email.trim()) return;
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`/api/booking/${slug}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          notes: notes.trim() || undefined,
          start_at: selectedSlot.start,
          end_at:   selectedSlot.end,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Booking failed."); return; }
      setConfirmed({ start: json.start_at, end: json.end_at, msg: json.confirmation_msg });
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  const grouped = groupSlotsByDate(slots, timezone);
  const duration = durationMinutes < 60
    ? `${durationMinutes} min`
    : durationMinutes % 60 === 0
      ? `${durationMinutes / 60}h`
      : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}min`;

  // ── Confirmed state ────────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{
          width: "100%", maxWidth: 480, background: S.card, borderRadius: 20,
          border: `1px solid ${S.border}`, padding: "40px 36px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: S.text }}>You're booked!</h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: S.dim }}>
            {fmtDate(confirmed.start, timezone)} · {fmtTime(confirmed.start, timezone)} – {fmtTime(confirmed.end, timezone)}
          </p>
          {confirmed.msg && (
            <p style={{ margin: "0 0 24px", fontSize: 14, color: S.dim, lineHeight: 1.6 }}>{confirmed.msg}</p>
          )}
          <p style={{ margin: 0, fontSize: 13, color: S.dim }}>A confirmation email has been sent to <strong style={{ color: S.text }}>{email}</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "32px 20px 80px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: S.dim }}>{hostName}</p>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, color: S.text }}>{title}</h1>
          {description && (
            <p style={{ margin: "0 auto 10px", fontSize: 14, color: S.dim, maxWidth: 520 }}>{description}</p>
          )}
          <span style={{
            display: "inline-block", marginTop: 10,
            fontSize: 12, fontWeight: 600, color: S.dim,
            background: "rgba(255,255,255,.06)", borderRadius: 20, padding: "4px 14px",
          }}>{duration} · {timezone}</span>
        </div>

        {!selectedSlot ? (
          /* ── Slot picker ── */
          loadingSlots ? (
            <div style={{ textAlign: "center", padding: 48, color: S.dim, fontSize: 14 }}>Loading available times…</div>
          ) : slots.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: S.dim, fontSize: 14 }}>No availability in the next 28 days.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {grouped.map((day) => (
                <div key={day.dateKey}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: S.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                    {day.dateLabel}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {day.slots.map((slot) => (
                      <button
                        key={slot.start}
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          padding: "9px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                          cursor: "pointer", border: `1px solid ${S.border}`,
                          background: "rgba(255,255,255,.05)", color: S.text,
                          transition: "all .12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "color-mix(in srgb, var(--gg-primary,#2563eb) 18%, transparent)";
                          e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary,#2563eb) 60%, transparent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,.05)";
                          e.currentTarget.style.borderColor = S.border;
                        }}
                      >
                        {fmtTime(slot.start, timezone)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* ── Booking form ── */
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            {/* Selected slot display */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "color-mix(in srgb, var(--gg-primary,#2563eb) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--gg-primary,#2563eb) 40%, transparent)",
              borderRadius: 12, padding: "14px 18px", marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: S.text }}>
                  {fmtDate(selectedSlot.start, timezone)}
                </div>
                <div style={{ fontSize: 13, color: S.dim, marginTop: 2 }}>
                  {fmtTime(selectedSlot.start, timezone)} – {fmtTime(selectedSlot.end, timezone)}
                </div>
              </div>
              <button
                onClick={() => setSelectedSlot(null)}
                style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", fontSize: 13, padding: "4px 8px" }}
              >
                Change
              </button>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: S.dim, marginBottom: 6 }}>Your Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    background: S.card, border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 14, boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: S.dim, marginBottom: 6 }}>Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    background: S.card, border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 14, boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: S.dim, marginBottom: 6 }}>Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you'd like to share before the meeting…"
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    background: S.card, border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 14, resize: "vertical", boxSizing: "border-box",
                  }}
                />
              </div>

              {error && <p style={{ margin: 0, fontSize: 13, color: "#fca5a5" }}>{error}</p>}

              <button
                onClick={handleConfirm}
                disabled={submitting || !name.trim() || !email.trim()}
                style={{
                  padding: "13px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                  border: "none", cursor: submitting || !name.trim() || !email.trim() ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg, var(--gg-primary,#2563eb), color-mix(in srgb, var(--gg-primary,#2563eb) 68%, #7c3aed))",
                  color: "#fff", opacity: submitting || !name.trim() || !email.trim() ? 0.5 : 1,
                  boxShadow: "0 4px 18px color-mix(in srgb, var(--gg-primary,#2563eb) 40%, transparent)",
                  transition: "opacity .12s",
                }}
              >
                {submitting ? "Confirming…" : "Confirm Booking"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
