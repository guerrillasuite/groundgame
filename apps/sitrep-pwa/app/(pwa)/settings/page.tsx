"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import { supabase } from "@/lib/supabase/client";

const S = {
  bg:     "rgb(10 13 20)",
  card:   "rgb(15 19 28)",
  surface:"rgb(20 25 38)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  dimBrt: "rgb(148 163 184)",
  border: "rgba(255,255,255,.07)",
} as const;

type SquadData = {
  id: string; name: string; color: string;
  is_default: boolean; sort_order: number;
  org_id: string | null; role: string;
};

type SquadMember = {
  id: string; user_id: string; name: string; email: string;
  role: string; joined_at: string;
};

export default function SettingsPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName,  setUserName]  = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null);
        setUserName(data.user.user_metadata?.name ?? data.user.user_metadata?.full_name ?? null);
      }
    });
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    localStorage.removeItem("sitrep_tenant_id");
    router.replace("/login");
  }

  const [squads,        setSquads]        = useState<SquadData[]>([]);
  const [squadsLoading, setSquadsLoading] = useState(true);
  const [expandedSquad, setExpandedSquad] = useState<string | null>(null);
  const [squadMembers,  setSquadMembers]  = useState<Record<string, SquadMember[]>>({});
  const [membersLoading,setMembersLoading]= useState<string | null>(null);

  const [inviteEmail,  setInviteEmail]  = useState<Record<string, string>>({});
  const [inviteRole,   setInviteRole]   = useState<Record<string, "collaborator" | "viewer">>({});
  const [inviteSending,setInviteSending]= useState<string | null>(null);
  const [inviteErr,    setInviteErr]    = useState<Record<string, string>>({});
  const [inviteSent,   setInviteSent]   = useState<Record<string, boolean>>({});

  const [newSquadName, setNewSquadName] = useState("");
  const [creatingSquad,setCreatingSquad]= useState(false);

  useEffect(() => {
    fetch("/api/sitrep/squads")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSquads(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setSquadsLoading(false));
  }, []);

  async function loadMembers(squadId: string) {
    if (squadMembers[squadId] || membersLoading === squadId) return;
    setMembersLoading(squadId);
    try {
      const res = await fetch(`/api/sitrep/squads/${squadId}/members`);
      if (res.ok) {
        const data = await res.json();
        setSquadMembers((p) => ({ ...p, [squadId]: Array.isArray(data) ? data : [] }));
      }
    } finally {
      setMembersLoading(null);
    }
  }

  function toggleSquad(squadId: string) {
    if (expandedSquad === squadId) {
      setExpandedSquad(null);
    } else {
      setExpandedSquad(squadId);
      loadMembers(squadId);
    }
  }

  async function handleCreateSquad() {
    const name = newSquadName.trim();
    if (!name || creatingSquad) return;
    setCreatingSquad(true);
    try {
      const res = await fetch("/api/sitrep/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const created = await res.json();
        setSquads((p) => [...p, created]);
        setNewSquadName("");
        setExpandedSquad(created.id);
      }
    } finally {
      setCreatingSquad(false);
    }
  }

  async function handleInvite(squadId: string) {
    const email = (inviteEmail[squadId] ?? "").trim();
    if (!email || inviteSending === squadId) return;
    setInviteSending(squadId);
    setInviteErr((p) => ({ ...p, [squadId]: "" }));
    setInviteSent((p) => ({ ...p, [squadId]: false }));
    try {
      const res = await fetch(`/api/sitrep/squads/${squadId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole[squadId] ?? "collaborator" }),
      });
      const json = await res.json();
      if (res.ok) {
        setInviteSent((p) => ({ ...p, [squadId]: true }));
        setInviteEmail((p) => ({ ...p, [squadId]: "" }));
        setSquadMembers((p) => { const n = { ...p }; delete n[squadId]; return n; });
        loadMembers(squadId);
      } else {
        setInviteErr((p) => ({ ...p, [squadId]: json.error ?? "Failed" }));
      }
    } finally {
      setInviteSending(null);
    }
  }

  async function handleRemove(squadId: string, userId: string) {
    if (!confirm("Remove this member?")) return;
    await fetch(`/api/sitrep/squads/${squadId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    setSquadMembers((p) => ({
      ...p,
      [squadId]: (p[squadId] ?? []).filter((m) => m.user_id !== userId),
    }));
  }

  return (
    <div style={{ minHeight: "100dvh", background: S.bg }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: S.bg,
        borderBottom: `1px solid ${S.border}`,
        padding: "12px 16px",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", padding: "4px 6px", fontSize: 20, lineHeight: 1 }}
        >←</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: S.text }}>Settings</span>
      </div>

      <div style={{ padding: "16px", display: "grid", gap: 16, maxWidth: 520, margin: "0 auto" }}>

        {/* Account card */}
        <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: "rgba(99,102,241,.2)", border: "1px solid rgba(99,102,241,.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#a5b4fc",
            }}>
              {(userName ?? userEmail ?? "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {userName && <div style={{ fontSize: 14, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>}
              <div style={{ fontSize: 13, color: S.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail ?? "…"}</div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, flexShrink: 0,
                border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
                color: "#fca5a5", cursor: "pointer", opacity: signingOut ? 0.5 : 1,
              }}
            >{signingOut ? "…" : "Sign out"}</button>
          </div>
        </div>

        {/* Squads card */}
        <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: S.text }}>Squads</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim, lineHeight: 1.5 }}>
              Share your SitRep with teammates. Invite someone to a squad — they'll see your squad's items.
            </p>
          </div>

          {/* Create squad */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={newSquadName}
              onChange={(e) => setNewSquadName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateSquad(); }}
              placeholder="New squad name…"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                background: S.surface, border: `1px solid ${S.border}`, color: S.text, outline: "none",
              }}
            />
            <button
              onClick={handleCreateSquad}
              disabled={!newSquadName.trim() || creatingSquad}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff",
                cursor: "pointer", opacity: !newSquadName.trim() || creatingSquad ? 0.5 : 1, flexShrink: 0,
              }}
            >{creatingSquad ? "…" : "Create"}</button>
          </div>

          {squadsLoading ? (
            <div style={{ fontSize: 13, color: S.dim, padding: "8px 0" }}>Loading…</div>
          ) : squads.length === 0 ? (
            <div style={{ background: S.surface, border: `1px dashed ${S.border}`, borderRadius: 10, padding: "20px 16px", textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: S.text }}>No squads yet.</p>
              <p style={{ margin: 0, fontSize: 12, color: S.dim }}>Create a squad and invite a teammate to share your calendar.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {squads.map((squad) => {
                const dot     = getFamilyByKey(squad.color)?.shades[3] ?? "#818cf8";
                const isOwner = squad.role === "owner";
                const isOpen  = expandedSquad === squad.id;
                const members = squadMembers[squad.id] ?? [];

                return (
                  <div key={squad.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleSquad(squad.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 10, color: S.dim }}>{isOpen ? "▼" : "▶"}</span>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: S.text }}>{squad.name}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                        background: isOwner ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.06)",
                        color: isOwner ? "#a5b4fc" : S.dim,
                      }}>
                        {isOwner ? "YOUR SQUAD" : squad.role.toUpperCase()}
                      </span>
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${S.border}` }}>
                        <div style={{ padding: "8px 0" }}>
                          {membersLoading === squad.id ? (
                            <div style={{ padding: "8px 14px 8px 34px", fontSize: 12, color: S.dim }}>Loading…</div>
                          ) : members.length === 0 ? (
                            <div style={{ padding: "8px 14px 8px 34px", fontSize: 12, color: S.dim }}>No members yet.</div>
                          ) : members.map((m) => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px 7px 34px" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: S.text }}>{m.name || m.email}</div>
                                {m.name && <div style={{ fontSize: 11, color: S.dim }}>{m.email}</div>}
                              </div>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, flexShrink: 0,
                                background: m.role === "owner" ? "rgba(99,102,241,.12)" : "rgba(255,255,255,.06)",
                                color: m.role === "owner" ? "#a5b4fc" : S.dim,
                              }}>{m.role.toUpperCase()}</span>
                              {isOwner && m.role !== "owner" && (
                                <button
                                  onClick={() => handleRemove(squad.id, m.user_id)}
                                  style={{
                                    padding: "2px 8px", fontSize: 11, borderRadius: 5, flexShrink: 0,
                                    border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
                                    color: "#fca5a5", cursor: "pointer",
                                  }}
                                >Remove</button>
                              )}
                            </div>
                          ))}
                        </div>

                        {(isOwner || squad.role === "collaborator") && (
                          <div style={{ padding: "10px 14px 14px 34px", borderTop: `1px solid ${S.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: S.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                              Invite by email
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <input
                                type="email"
                                value={inviteEmail[squad.id] ?? ""}
                                onChange={(e) => setInviteEmail((p) => ({ ...p, [squad.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") handleInvite(squad.id); }}
                                placeholder="teammate@example.com"
                                style={{
                                  flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 7, fontSize: 12,
                                  background: S.card, border: `1px solid ${S.border}`, color: S.text, outline: "none",
                                }}
                              />
                              <select
                                value={inviteRole[squad.id] ?? "collaborator"}
                                onChange={(e) => setInviteRole((p) => ({ ...p, [squad.id]: e.target.value as any }))}
                                style={{
                                  padding: "7px 10px", borderRadius: 7, fontSize: 12,
                                  background: S.card, border: `1px solid ${S.border}`, color: S.dim,
                                }}
                              >
                                <option value="collaborator">Collaborator</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                onClick={() => handleInvite(squad.id)}
                                disabled={inviteSending === squad.id || !(inviteEmail[squad.id] ?? "").trim()}
                                style={{
                                  padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                                  border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff",
                                  cursor: "pointer", opacity: inviteSending === squad.id ? 0.5 : 1, flexShrink: 0,
                                }}
                              >{inviteSending === squad.id ? "…" : "Invite"}</button>
                            </div>
                            {inviteErr[squad.id] && (
                              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#fca5a5" }}>{inviteErr[squad.id]}</p>
                            )}
                            {inviteSent[squad.id] && (
                              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#4ade80" }}>Added successfully. They'll see your squad items in their SitRep.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
