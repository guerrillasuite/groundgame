"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { STAGE_PRESETS } from "@/lib/opportunityPresets";

// ── Types ────────────────────────────────────────────────────────────────────

type AdminIdentity = {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  tenantId: string | null;
  role: string | null;
};

type CrmUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "field" | null;
  tenantId: string | null;
  lastSignIn: string | null;
  createdAt: string | null;
};

type Tenant = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function RoleBadge({ role }: { role: string | null }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    super_admin: { bg: "#1d4ed8", color: "#fff", label: "Super Admin" },
    admin:       { bg: "#7c3aed", color: "#fff", label: "Admin" },
    field:       { bg: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", label: "Field" },
  };
  const s = styles[role ?? ""] ?? { bg: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.4)", label: "—" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.04em",
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
      <input
        readOnly
        value={value}
        style={{
          flex: 1,
          padding: "6px 10px",
          fontSize: 12,
          fontFamily: "monospace",
          background: "rgba(0,0,0,.3)",
          border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 6,
          color: "rgba(255,255,255,.8)",
        }}
      />
      <button onClick={copy} style={btnStyle("rgba(255,255,255,.1)")}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

// ── Shared button style ───────────────────────────────────────────────────────

function btnStyle(bg: string, danger = false): React.CSSProperties {
  return {
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: danger ? "#dc2626" : bg,
    color: "#fff",
    whiteSpace: "nowrap",
  };
}

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.05)",
  color: "#fff",
  boxSizing: "border-box",
};

const SELECT: React.CSSProperties = { ...INPUT };

// ── Main component ────────────────────────────────────────────────────────────

export default function UsersPanel() {
  const [session, setSession] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filterTenantId, setFilterTenantId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "field">("field");
  const [inviteTenant, setInviteTenant] = useState<string>("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "field">("field");
  const [editPassword, setEditPassword] = useState("");
  const [editConfirm, setEditConfirm] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [magicLoading, setMagicLoading] = useState(false);

  // Tenant membership state (super-admin only)
  type TenantMembership = { tenant_id: string; role: string; is_default: boolean; status: string };
  const [userTenants, setUserTenants] = useState<TenantMembership[]>([]);
  const [userTenantsLoading, setUserTenantsLoading] = useState(false);
  const [addTenantId, setAddTenantId] = useState("");
  const [addTenantRole, setAddTenantRole] = useState<"admin" | "field">("field");
  const [tenantMgmtErr, setTenantMgmtErr] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Tenant creation state
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("telemarketing");
  const [tenantSaving, setTenantSaving] = useState(false);
  const [tenantErr, setTenantErr] = useState<string | null>(null);

  // ── Init: get session & identity ──────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session;
      setSession(sess);
      const tok = sess?.access_token ?? null;
      setToken(tok);
      if (tok) fetchIdentity(tok);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      const tok = sess?.access_token ?? null;
      setToken(tok);
      if (tok) fetchIdentity(tok);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function fetchIdentity(tok: string) {
    const res = await fetch("/api/crm/admin/me", {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) return;
    const id: AdminIdentity = await res.json();
    setIdentity(id);
    if (id.isSuperAdmin) {
      setFilterTenantId("all");
      fetchTenants(tok);
    } else if (id.tenantId) {
      setFilterTenantId(id.tenantId);
      setInviteTenant(id.tenantId);
    }
  }

  const fetchUsers = useCallback(
    async (tok: string, tenantId: string) => {
      setLoading(true);
      setErr(null);
      const qs = tenantId && tenantId !== "all" ? `?tenantId=${tenantId}` : "?tenantId=all";
      const res = await fetch(`/api/crm/admin/users${qs}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Failed to load users");
      } else {
        setUsers(await res.json());
      }
      setLoading(false);
    },
    []
  );

  async function fetchTenants(tok: string) {
    const res = await fetch("/api/crm/admin/tenants", {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) setTenants(await res.json());
  }

  // Re-fetch users whenever identity or filter changes
  useEffect(() => {
    if (token && identity) {
      fetchUsers(token, filterTenantId);
    }
  }, [token, identity, filterTenantId, fetchUsers]);

  // ── Invite ────────────────────────────────────────────────────────────────

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setInviting(true);
    setInviteErr(null);
    setInviteLink(null);

    const tenantId = identity?.isSuperAdmin ? inviteTenant : (identity?.tenantId ?? "");
    if (!tenantId) { setInviteErr("Select a tenant"); setInviting(false); return; }

    const res = await fetch("/api/crm/admin/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        name: inviteName || undefined,
        role: inviteRole,
        tenantId,
        password: invitePassword || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setInviteErr(data.error ?? "Failed to create user");
    } else {
      setInviteLink(data.inviteLink ?? null);
      setInviteEmail(""); setInviteName(""); setInvitePassword("");
      fetchUsers(token, filterTenantId);
      if (!data.inviteLink) setShowInvite(false);
    }
    setInviting(false);
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  async function fetchUserTenants(userId: string) {
    if (!token) return;
    setUserTenantsLoading(true);
    setTenantMgmtErr(null);
    const res = await fetch(`/api/crm/admin/users/${userId}/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUserTenants(await res.json());
    else setUserTenants([]);
    setUserTenantsLoading(false);
  }

  function startEdit(u: CrmUser) {
    setEditingId(u.id);
    setEditName(u.name);
    setEditRole(u.role ?? "field");
    setEditPassword("");
    setEditConfirm("");
    setEditErr(null);
    setMagicLink(null);
    setUserTenants([]);
    setAddTenantId("");
    setAddTenantRole("field");
    setTenantMgmtErr(null);
    if (identity?.isSuperAdmin) fetchUserTenants(u.id);
  }

  async function handleAddTenant(userId: string) {
    if (!token || !addTenantId) return;
    setTenantMgmtErr(null);
    const res = await fetch(`/api/crm/admin/users/${userId}/tenants`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: addTenantId, role: addTenantRole }),
    });
    const data = await res.json();
    if (!res.ok) { setTenantMgmtErr(data.error ?? "Failed to add tenant"); return; }
    setAddTenantId("");
    fetchUserTenants(userId);
  }

  async function handleRemoveTenant(userId: string, tenantId: string) {
    if (!token) return;
    setTenantMgmtErr(null);
    const res = await fetch(`/api/crm/admin/users/${userId}/tenants`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const data = await res.json();
    if (!res.ok) { setTenantMgmtErr(data.error ?? "Failed to remove tenant"); return; }
    fetchUserTenants(userId);
  }

  async function handleSetDefaultTenant(userId: string, tenantId: string) {
    if (!token) return;
    setTenantMgmtErr(null);
    const res = await fetch(`/api/crm/admin/users/${userId}/tenants`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const data = await res.json();
    if (!res.ok) { setTenantMgmtErr(data.error ?? "Failed to set default"); return; }
    fetchUserTenants(userId);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editingId) return;
    if (editPassword && editPassword !== editConfirm) {
      setEditErr("Passwords don't match");
      return;
    }
    setEditSaving(true);
    setEditErr(null);

    const body: Record<string, any> = { name: editName, role: editRole };
    if (editPassword) body.password = editPassword;

    const res = await fetch(`/api/crm/admin/users/${editingId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      setEditErr(data.error ?? "Failed to save");
    } else {
      setEditingId(null);
      fetchUsers(token, filterTenantId);
    }
    setEditSaving(false);
  }

  async function handleMagicLink(userId: string) {
    if (!token) return;
    setMagicLoading(true);
    setMagicLink(null);
    const userRole = users.find((u) => u.id === userId)?.role;
    const next = userRole === "admin" ? "/crm" : "/";
    const res = await fetch(`/api/crm/admin/users/${userId}/magic-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ next }),
    });
    const data = await res.json();
    if (res.ok && data.link) setMagicLink(data.link);
    else setEditErr(data.error ?? "Failed to generate link");
    setMagicLoading(false);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!token || !deletingId) return;
    const res = await fetch(`/api/crm/admin/users/${deletingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDeletingId(null);
      setDeleteConfirm(false);
      fetchUsers(token, filterTenantId);
    }
  }

  // ── Create Tenant ─────────────────────────────────────────────────────────

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setTenantSaving(true);
    setTenantErr(null);

    const res = await fetch("/api/crm/admin/tenants", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ slug: newSlug, name: newName }),
    });

    const data = await res.json();
    if (!res.ok) {
      setTenantErr(data.error ?? "Failed to create tenant");
    } else {
      // Seed pipeline stages from selected template
      const preset = STAGE_PRESETS.find((p) => p.id === newTemplate) ?? STAGE_PRESETS[0];
      await fetch(`/api/crm/opportunities/stages?tenantId=${data.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stages: preset.stages }),
      }).catch(() => {}); // non-fatal: stages can be configured later

      setNewSlug(""); setNewName(""); setNewTemplate("telemarketing");
      setShowNewTenant(false);
      fetchTenants(token);
    }
    setTenantSaving(false);
  }

  // ── Tenant name lookup ────────────────────────────────────────────────────

  function tenantName(id: string | null): string {
    if (!id) return "—";
    return tenants.find((t) => t.id === id)?.name ?? id.slice(0, 8) + "…";
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <section className="stack" style={{ padding: "2rem" }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <p style={{ opacity: 0.6 }}>
          You must be logged in to manage users.{" "}
          <a href="/crm/account/auth" style={{ color: "var(--gg-primary, #2563eb)" }}>
            Go to Login →
          </a>
        </p>
      </section>
    );
  }

  if (identity && identity.role !== "admin" && !identity.isSuperAdmin) {
    return (
      <section className="stack" style={{ padding: "2rem" }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <p style={{ opacity: 0.6 }}>You don't have permission to manage users.</p>
      </section>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 1,
  };

  const editingUser = users.find((u) => u.id === editingId);
  const deletingUser = users.find((u) => u.id === deletingId);

  return (
    <section className="stack" style={{ padding: "1.5rem", maxWidth: 860 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0, flex: 1 }}>Users</h1>

        {identity?.isSuperAdmin && (
          <select
            value={filterTenantId}
            onChange={(e) => setFilterTenantId(e.target.value)}
            style={{ ...SELECT, width: "auto", minWidth: 160 }}
          >
            <option value="all">All Tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        <button
          onClick={() => { setShowInvite(!showInvite); setInviteLink(null); setInviteErr(null); }}
          style={{ ...btnStyle("var(--gg-primary, #2563eb)") }}
        >
          + Invite User
        </button>
      </div>

      {/* ── Invite Form ── */}
      {showInvite && (
        <div style={{ ...card, borderColor: "rgba(37,99,235,.4)" }}>
          <h3 style={{ margin: "0 0 12px" }}>Invite New User</h3>
          <form onSubmit={handleInvite} style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Email *</label>
                <input required type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={INPUT} placeholder="user@example.com" />
              </div>
              <div>
                <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Name (optional)</label>
                <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} style={INPUT} placeholder="Jane Smith" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: identity?.isSuperAdmin ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Role *</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "field")} style={SELECT}>
                  <option value="field">Field</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {identity?.isSuperAdmin && (
                <div>
                  <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Tenant *</label>
                  <select required value={inviteTenant} onChange={(e) => setInviteTenant(e.target.value)} style={SELECT}>
                    <option value="">Select tenant…</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>
                  Password <span style={{ opacity: 0.5 }}>(leave blank → invite link)</span>
                </label>
                <input type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} style={INPUT} placeholder="Optional initial password" />
              </div>
            </div>

            {inviteErr && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{inviteErr}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={inviting} style={btnStyle("var(--gg-primary, #2563eb)")}>
                {inviting ? "Creating…" : "Create User"}
              </button>
              <button type="button" onClick={() => setShowInvite(false)} style={btnStyle("rgba(255,255,255,.08)")}>
                Cancel
              </button>
            </div>
          </form>

          {inviteLink && (
            <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(22,163,74,.15)", border: "1px solid rgba(22,163,74,.3)", borderRadius: 8 }}>
              <p style={{ fontSize: 13, margin: "0 0 4px", color: "#86efac" }}>
                User created. Share this invite link (expires in 24h):
              </p>
              <CopyBox value={inviteLink} />
            </div>
          )}
        </div>
      )}

      {/* ── Error / Loading ── */}
      {err && <p style={{ color: "#f87171", fontSize: 13 }}>{err}</p>}
      {loading && <p style={{ opacity: 0.5, fontSize: 13 }}>Loading users…</p>}

      {/* ── User Table ── */}
      {!loading && users.length === 0 && !err && (
        <p style={{ opacity: 0.5, fontSize: 13 }}>No users found.</p>
      )}

      {users.map((u) => {
        const isEditing = editingId === u.id;
        const isDeleting = deletingId === u.id;
        const isSelf = u.id === identity?.userId;

        return (
          <div key={u.id} style={card}>
            {/* ── Row: user info ── */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              {/* Avatar */}
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "var(--gg-primary, #2563eb)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>
                {(u.name || u.email).charAt(0).toUpperCase()}
              </div>

              {/* Name / email */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {u.name || u.email}
                    {isSelf && <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>(you)</span>}
                  </span>
                  <RoleBadge role={isSelf && identity?.isSuperAdmin ? "super_admin" : u.role} />
                </div>
                <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
                  {u.name ? u.email : null}
                  {u.name && identity?.isSuperAdmin ? " · " : null}
                  {identity?.isSuperAdmin ? tenantName(u.tenantId) : null}
                  {" · Last login: "}{relativeTime(u.lastSignIn)}
                </div>
              </div>

              {/* Actions */}
              {!isSelf && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => isEditing ? setEditingId(null) : startEdit(u)}
                    style={btnStyle("rgba(255,255,255,.1)")}
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </button>
                  <button
                    onClick={() => { setDeletingId(u.id); setDeleteConfirm(false); }}
                    style={btnStyle("rgba(255,255,255,.05)", true)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* ── Edit panel ── */}
            {isEditing && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                <form onSubmit={handleEdit} style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Name</label>
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={INPUT} placeholder="Display name" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Role</label>
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value as "admin" | "field")} style={SELECT}>
                        <option value="field">Field</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>New Password <span style={{ opacity: 0.5 }}>(leave blank to keep)</span></label>
                      <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} style={INPUT} placeholder="New password" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Confirm Password</label>
                      <input type="password" value={editConfirm} onChange={(e) => setEditConfirm(e.target.value)} style={INPUT} placeholder="Confirm" />
                    </div>
                  </div>

                  {editErr && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{editErr}</p>}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button type="submit" disabled={editSaving} style={btnStyle("var(--gg-primary, #2563eb)")}>
                      {editSaving ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMagicLink(u.id)}
                      disabled={magicLoading}
                      style={btnStyle("rgba(255,255,255,.1)")}
                    >
                      {magicLoading ? "Generating…" : "Send Magic Link"}
                    </button>
                  </div>
                </form>

                {magicLink && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(22,163,74,.12)", border: "1px solid rgba(22,163,74,.25)", borderRadius: 8 }}>
                    <p style={{ fontSize: 12, margin: "0 0 4px", color: "#86efac" }}>Magic link (expires soon):</p>
                    <CopyBox value={magicLink} />
                  </div>
                )}

                {/* ── Tenant Memberships (super-admin only) ── */}
                {identity?.isSuperAdmin && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                      Tenant Access
                    </div>

                    {userTenantsLoading && <p style={{ fontSize: 12, opacity: 0.5, margin: "0 0 8px" }}>Loading…</p>}

                    {!userTenantsLoading && userTenants.map((m) => {
                      const t = tenants.find((t) => t.id === m.tenant_id);
                      return (
                        <div key={m.tenant_id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                            {t?.name ?? m.tenant_id.slice(0, 8) + "…"}
                            <span style={{ fontSize: 11, opacity: 0.45, marginLeft: 6 }}>{t?.slug}</span>
                          </span>
                          <span style={{ fontSize: 11, opacity: 0.6, background: "rgba(255,255,255,.08)", padding: "2px 8px", borderRadius: 10 }}>
                            {m.role}
                          </span>
                          {m.is_default && (
                            <span style={{ fontSize: 11, background: "rgba(37,99,235,.3)", color: "#93c5fd", padding: "2px 8px", borderRadius: 10 }}>
                              default
                            </span>
                          )}
                          {!m.is_default && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultTenant(u.id, m.tenant_id)}
                              style={btnStyle("rgba(255,255,255,.07)")}
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveTenant(u.id, m.tenant_id)}
                            style={btnStyle("rgba(255,255,255,.05)", true)}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}

                    {!userTenantsLoading && userTenants.length === 0 && (
                      <p style={{ fontSize: 12, opacity: 0.4, margin: "0 0 8px" }}>No tenant access yet.</p>
                    )}

                    {/* Add tenant row */}
                    {(() => {
                      const assignedIds = new Set(userTenants.map((m) => m.tenant_id));
                      const available = tenants.filter((t) => !assignedIds.has(t.id));
                      if (!available.length) return null;
                      return (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <select
                            value={addTenantId}
                            onChange={(e) => setAddTenantId(e.target.value)}
                            style={{ ...SELECT, flex: 2, minWidth: 140 }}
                          >
                            <option value="">Add tenant…</option>
                            {available.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          <select
                            value={addTenantRole}
                            onChange={(e) => setAddTenantRole(e.target.value as "admin" | "field")}
                            style={{ ...SELECT, flex: 1, minWidth: 90 }}
                          >
                            <option value="field">Field</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            type="button"
                            disabled={!addTenantId}
                            onClick={() => handleAddTenant(u.id)}
                            style={btnStyle("var(--gg-primary, #2563eb)")}
                          >
                            Add
                          </button>
                        </div>
                      );
                    })()}

                    {tenantMgmtErr && <p style={{ color: "#f87171", fontSize: 12, margin: "6px 0 0" }}>{tenantMgmtErr}</p>}
                  </div>
                )}
              </div>
            )}

            {/* ── Delete confirmation ── */}
            {isDeleting && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                {!deleteConfirm ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                      Delete <strong>{u.email}</strong>? This cannot be undone.
                    </span>
                    <button onClick={() => setDeleteConfirm(true)} style={btnStyle("rgba(255,255,255,.08)", true)}>
                      Yes, Delete
                    </button>
                    <button onClick={() => setDeletingId(null)} style={btnStyle("rgba(255,255,255,.08)")}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#f87171" }}>
                      Are you absolutely sure?
                    </span>
                    <button onClick={handleDelete} style={btnStyle("#dc2626")}>
                      Delete Permanently
                    </button>
                    <button onClick={() => setDeletingId(null)} style={btnStyle("rgba(255,255,255,.08)")}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Tenants section (super-admin only) ── */}
      {identity?.isSuperAdmin && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Tenants</h2>
            <button
              onClick={() => { setShowNewTenant(!showNewTenant); setTenantErr(null); }}
              style={btnStyle("rgba(255,255,255,.08)")}
            >
              + Create New Tenant
            </button>
          </div>

          {showNewTenant && (
            <div style={{ ...card, borderColor: "rgba(37,99,235,.3)", marginBottom: 12 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>New Tenant</h3>
              <form onSubmit={handleCreateTenant} style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Slug * <span style={{ opacity: 0.5 }}>(used in subdomain)</span></label>
                    <input required type="text" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} style={INPUT} placeholder="my-org" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Display Name *</label>
                    <input required type="text" value={newName} onChange={(e) => setNewName(e.target.value)} style={INPUT} placeholder="My Organization" />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Starting Pipeline Template</label>
                  <select value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} style={INPUT}>
                    {STAGE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {tenantErr && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{tenantErr}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" disabled={tenantSaving} style={btnStyle("var(--gg-primary, #2563eb)")}>
                    {tenantSaving ? "Creating…" : "Create Tenant"}
                  </button>
                  <button type="button" onClick={() => setShowNewTenant(false)} style={btnStyle("rgba(255,255,255,.08)")}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: "grid", gap: 1 }}>
            {tenants.map((t) => (
              <div key={t.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: "rgba(255,255,255,.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.6)",
                  flexShrink: 0,
                }}>
                  {t.slug.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.45 }}>{t.slug} · {t.id}</div>
                </div>
              </div>
            ))}
            {tenants.length === 0 && (
              <p style={{ opacity: 0.4, fontSize: 13 }}>No tenants yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
