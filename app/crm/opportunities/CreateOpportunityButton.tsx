"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Stage = { key: string; label: string };

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
];

const SOURCE_OPTIONS = [
  { value: "doors",   label: "Door Canvassing" },
  { value: "call",    label: "Phone Call" },
  { value: "email",   label: "Email" },
  { value: "website", label: "Website" },
  { value: "referral",label: "Referral" },
  { value: "other",   label: "Other" },
];

export default function CreateOpportunityButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);

  const [title, setTitle]     = useState("");
  const [stage, setStage]     = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource]   = useState("");
  const [amount, setAmount]   = useState("");
  const [dueAt, setDueAt]     = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/crm/opportunities/stages")
      .then((r) => r.json())
      .then((d) => {
        const s = Array.isArray(d) ? d : (d?.stages ?? []);
        setStages(s);
        if (s.length > 0 && !stage) setStage(s[0].key);
      })
      .catch(() => {});
  }, [open]);

  function handleClose() {
    setOpen(false);
    setErr(null);
    setTitle(""); setStage(""); setPriority(""); setSource(""); setAmount(""); setDueAt("");
  }

  function submit() {
    if (!title.trim()) { setErr("Title is required"); return; }
    start(async () => {
      try {
        const res = await fetch("/api/crm/opportunities/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            stage: stage || undefined,
            priority: priority || undefined,
            source: source || undefined,
            amount_cents: amount ? Math.round(parseFloat(amount.replace(/[$,]/g, "")) * 100) : undefined,
            due_at: dueAt || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create opportunity");
        handleClose();
        router.refresh();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to create opportunity");
      }
    });
  }

  const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
  const dim: React.CSSProperties = { opacity: 0.6 };

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + New Opportunity
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div style={{
            background: "var(--gg-card, #10131b)",
            border: "1px solid var(--gg-border, #22283a)",
            borderRadius: 10, padding: 24, width: "100%", maxWidth: 420,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New Opportunity</h3>

            <label style={label}>
              <span style={dim}>Title *</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow-up with Jane Smith" autoFocus />
            </label>

            <label style={label}>
              <span style={dim}>Stage</span>
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">— select —</option>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ ...label, flex: 1 }}>
                <span style={dim}>Priority</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="">—</option>
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ ...label, flex: 1 }}>
                <span style={dim}>Source</span>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">—</option>
                  {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ ...label, flex: 1 }}>
                <span style={dim}>Value ($)</span>
                <input
                  type="number" min="0" step="0.01"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label style={{ ...label, flex: 1 }}>
                <span style={dim}>Due Date</span>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </label>
            </div>

            {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={handleClose} disabled={pending}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
                {pending ? "Creating…" : "Create Opportunity"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
