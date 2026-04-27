"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Feed {
  id: string;
  name: string;
  feed_url: string;
  tenant_id: string | null;
  created_at: string;
}

export default function IntelBriefFeedsPage() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTenantId, setNewTenantId] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/crm/admin/intel-brief-feeds");
    if (res.status === 403) { router.replace("/crm"); return; }
    const data = await res.json();
    if (Array.isArray(data)) setFeeds(data);
    else setError(data.error ?? "Failed to load");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    const res = await fetch("/api/crm/admin/intel-brief-feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), feed_url: newUrl.trim(), tenant_id: newTenantId.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed"); }
    else { setNewName(""); setNewUrl(""); setNewTenantId(""); await load(); }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feed?")) return;
    await fetch("/api/crm/admin/intel-brief-feeds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const card: React.CSSProperties = {
    background: "var(--gg-card,white)", border: "1px solid var(--gg-border,#e5e7eb)",
    borderRadius: 12, padding: "20px 22px", marginBottom: 20,
  };
  const inp: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 7,
    border: "1px solid var(--gg-border,#d1d5db)",
    fontSize: 14, background: "var(--gg-bg,#f9fafb)", color: "var(--gg-text,#111)",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>📡 Intel Brief Feeds</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--gg-text-dim,#6b7280)" }}>
        Manage global RSS/Atom feeds ingested by the Intel Brief pipeline.
        Leave Tenant ID blank for global feeds shared across all tenants.
      </p>

      {error && (
        <div style={{ padding: 12, background: "rgba(239,68,68,.1)", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Add feed */}
      <div style={card}>
        <p style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Add Feed</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10, marginBottom: 10 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={inp} />
          <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="RSS/Atom URL" style={inp} />
          <input value={newTenantId} onChange={(e) => setNewTenantId(e.target.value)} placeholder="Tenant ID (opt.)" style={inp} />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim() || !newUrl.trim()}
          style={{
            padding: "8px 20px", borderRadius: 7, border: "none", cursor: "pointer",
            background: "var(--gg-primary,#2563eb)", color: "white",
            fontSize: 14, fontWeight: 700, opacity: adding ? .6 : 1,
          }}
        >
          {adding ? "Adding…" : "+ Add Feed"}
        </button>
      </div>

      {/* Feed list */}
      <div style={card}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--gg-text-dim,#9ca3af)" }}>Loading…</p>
        ) : feeds.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--gg-text-dim,#9ca3af)", fontStyle: "italic" }}>No feeds configured yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {feeds.map((feed, i) => (
              <div key={feed.id} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 0",
                borderTop: i > 0 ? "1px solid var(--gg-border,#f3f4f6)" : "none",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "var(--gg-text,#111)" }}>{feed.name}</p>
                  <p style={{ margin: "0 0 3px", fontSize: 12, color: "var(--gg-text-dim,#6b7280)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {feed.feed_url}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--gg-text-dim,#9ca3af)" }}>
                    {feed.tenant_id ? `Tenant: ${feed.tenant_id}` : "Global"}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(feed.id)}
                  style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer", color: "#ef4444", fontSize: 12, fontWeight: 600, padding: "4px 10px", flexShrink: 0, marginTop: 2 }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
