"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type MissionStats = { tasks: number; events: number; meetings: number; doneTasks: number };

type Mission = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  visibility: string;
  created_by: string;
  created_at: string;
  stats: MissionStats;
};

type Props = {
  initialMissions: Mission[];
  currentUserId: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; accent: string; bg: string }> = {
  planning: { label: "Planning", dot: "○", accent: "rgba(134,150,168,.5)", bg: "rgba(134,150,168,.08)" },
  active:   { label: "Active",   dot: "●", accent: "rgba(var(--primary-600,37 99 235),.7)", bg: "rgba(37,99,235,.1)" },
  complete: { label: "Complete", dot: "✓", accent: "rgba(22,163,74,.7)",    bg: "rgba(22,163,74,.1)" },
  archived: { label: "Archived", dot: "◻", accent: "rgba(107,114,128,.4)", bg: "rgba(107,114,128,.06)" },
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const past = d < today;
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined }),
    past,
  };
}

function progress(stats: MissionStats) {
  if (stats.tasks === 0) return null;
  return Math.round((stats.doneTasks / stats.tasks) * 100);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MissionsPanel({ initialMissions, currentUserId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [tab, setTab] = useState<"all" | "planning" | "active" | "complete">(
    (searchParams.get("tab") as "all" | "planning" | "active" | "complete") || "all"
  );

  function switchTab(t: "all" | "planning" | "active" | "complete") {
    setTab(t);
    const p = new URLSearchParams(searchParams.toString());
    t === "all" ? p.delete("tab") : p.set("tab", t);
    router.replace(`?${p}`);
  }

  // New mission modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle,   setNewTitle]   = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newStatus,  setNewStatus]  = useState("planning");
  const [newDueDate, setNewDueDate] = useState("");
  const [newVis,     setNewVis]     = useState("team");
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState("");

  const filtered = tab === "all" ? missions : missions.filter((m) => m.status === tab);

  const S = {
    surface: "rgb(18 23 33)",
    card:    "rgb(28 36 48)",
    border:  "rgb(43 53 67)",
    text:    "rgb(238 242 246)",
    dim:     "rgb(134 150 168)",
  } as const;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) { setCreateErr("Title is required."); return; }
    setCreating(true); setCreateErr("");

    const res = await fetch("/api/crm/sitrep/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        description: newDesc || null,
        status: newStatus,
        due_date: newDueDate || null,
        visibility: newVis,
      }),
    });

    if (res.ok) {
      const { id } = await res.json();
      setMissions((prev) => [{
        id, title: newTitle.trim(), description: newDesc || null,
        status: newStatus, due_date: newDueDate || null,
        visibility: newVis, created_by: currentUserId,
        created_at: new Date().toISOString(),
        stats: { tasks: 0, events: 0, meetings: 0, doneTasks: 0 },
      }, ...prev]);
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewStatus("planning"); setNewDueDate(""); setNewVis("team");
    } else {
      const err = await res.json().catch(() => ({}));
      setCreateErr(err.error ?? "Failed to create.");
    }
    setCreating(false);
  }

  const counts = {
    all:      missions.length,
    planning: missions.filter((m) => m.status === "planning").length,
    active:   missions.filter((m) => m.status === "active").length,
    complete: missions.filter((m) => m.status === "complete").length,
  };

  return (
    <div className="stack" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Link href="/crm/sitrep" style={{ fontSize: 13, color: S.dim, display: "flex", alignItems: "center", gap: 5 }}>
              ← SitRep
            </Link>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Missions</h1>
          <p className="text-dim" style={{ marginTop: 4, fontSize: 13 }}>
            {counts.active} active · {counts.planning} planning · {counts.complete} complete
          </p>
        </div>
        <button
          className="btn"
          onClick={() => setShowCreate(true)}
          style={{ padding: "7px 16px", fontSize: 13, borderRadius: 10, flexShrink: 0 }}
        >
          + New Mission
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(["all","planning","active","complete"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: active ? "1px solid rgba(255,255,255,.2)" : `1px solid ${S.border}`,
                background: active ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.03)",
                color: active ? S.text : S.dim,
                cursor: "pointer", transition: "all .1s",
              }}
            >
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              {" "}
              <span style={{ opacity: 0.6 }}>{counts[t]}</span>
            </button>
          );
        })}
      </div>

      {/* ── Mission cards ── */}
      {filtered.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: S.dim }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>⬡</div>
          <div style={{ fontWeight: 600 }}>
            {tab === "all" ? "No missions yet." : `No ${tab} missions.`}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
            Missions group related tasks, events, and meetings.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((m) => {
            const cfg  = STATUS_CFG[m.status] ?? STATUS_CFG.planning;
            const pct  = progress(m.stats);
            const date = fmtDate(m.due_date);
            const itemCount = m.stats.tasks + m.stats.events + m.stats.meetings;

            return (
              <Link
                key={m.id}
                href={`/crm/sitrep/missions/${m.id}`}
                style={{ textDecoration: "none", display: "block" }}
              >
                <div
                  style={{
                    background: S.card,
                    border: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${cfg.accent}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                    transition: "border-color .12s, background .12s, box-shadow .12s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = "rgba(255,255,255,.12)";
                    el.style.background  = "rgb(32 41 55)";
                    el.style.boxShadow   = "0 4px 16px rgba(0,0,0,.3)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = S.border;
                    el.style.background  = S.card;
                    el.style.boxShadow   = "none";
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Status + item-count badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                          padding: "2px 8px", borderRadius: 20,
                          background: cfg.bg, color: cfg.accent,
                          border: `1px solid ${cfg.accent}55`,
                        }}>
                          {cfg.dot} {cfg.label.toUpperCase()}
                        </span>
                        {m.stats.tasks > 0 && (
                          <span style={{ fontSize: 10, color: S.dim, fontWeight: 600 }}>
                            {m.stats.tasks} task{m.stats.tasks !== 1 ? "s" : ""}
                          </span>
                        )}
                        {m.stats.events > 0 && (
                          <span style={{ fontSize: 10, color: S.dim, fontWeight: 600 }}>
                            {m.stats.events} event{m.stats.events !== 1 ? "s" : ""}
                          </span>
                        )}
                        {m.stats.meetings > 0 && (
                          <span style={{ fontSize: 10, color: S.dim, fontWeight: 600 }}>
                            {m.stats.meetings} mtg{m.stats.meetings !== 1 ? "s" : ""}
                          </span>
                        )}
                        {itemCount === 0 && (
                          <span style={{ fontSize: 10, color: S.dim }}>No items yet</span>
                        )}
                      </div>

                      {/* Title */}
                      <div style={{ fontSize: 15, fontWeight: 700, color: S.text, lineHeight: 1.3 }}>
                        {m.title}
                      </div>

                      {/* Description */}
                      {m.description && (
                        <div style={{
                          fontSize: 12, color: S.dim, marginTop: 4,
                          overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {m.description}
                        </div>
                      )}
                    </div>

                    {/* Due date */}
                    {date && (
                      <div style={{
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                        color: date.past ? "rgb(220 38 38)" : S.dim,
                      }}>
                        {date.past ? "⚠ " : ""}{date.label}
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  {pct !== null && (
                    <div>
                      <div style={{
                        height: 4, borderRadius: 2,
                        background: "rgba(255,255,255,.08)",
                        overflow: "hidden", marginTop: 4,
                      }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: pct === 100
                            ? "rgb(22 163 74)"
                            : "var(--gg-primary, #2563eb)",
                          borderRadius: 2,
                          transition: "width .3s ease",
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: S.dim, marginTop: 4, fontWeight: 600 }}>
                        {pct}% · {m.stats.doneTasks} of {m.stats.tasks} tasks done
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,.65)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            width: "min(480px, 100%)",
            background: S.card, border: `1px solid ${S.border}`,
            borderRadius: 16, padding: 24,
            boxShadow: "0 24px 64px rgba(0,0,0,.5)",
            display: "grid", gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>New Mission</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  Title <span style={{ color: "rgb(220 38 38)" }}>*</span>
                </label>
                <input
                  type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Mission title…" autoFocus
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Description</label>
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} placeholder="Optional description…"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, resize: "vertical", background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Status</label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }}>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Due Date</label>
                  <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Visibility</label>
                <select value={newVis} onChange={(e) => setNewVis(e.target.value)}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }}>
                  <option value="private">Private (only me)</option>
                  <option value="team">Team (all CRM users)</option>
                </select>
              </div>
              {createErr && <p style={{ margin: 0, fontSize: 12, color: "rgb(220 38 38)" }}>{createErr}</p>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{ padding: "8px 18px", borderRadius: 8, fontSize: 13, border: `1px solid ${S.border}`, background: "rgba(255,255,255,.04)", color: S.dim, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating || !newTitle.trim()} className="btn"
                  style={{ padding: "8px 22px", fontSize: 13, borderRadius: 8 }}>
                  {creating ? "Creating…" : "Create Mission"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
