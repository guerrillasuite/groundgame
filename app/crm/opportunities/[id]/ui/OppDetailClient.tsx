"use client";

import { useState, useTransition } from "react";
import LocationPicker, { type LocationValue } from "@/app/components/crm/LocationPicker";
import {
  updateOpportunityField,
  addPersonToOpportunity,
  removePersonFromOpportunity,
  addUserToOpportunity,
  removeUserFromOpportunity,
  addOpportunityItem,
  removeOpportunityItem,
  updateOpportunityItemQty,
} from "../../actions";

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 13,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.05)",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const BTN = (variant: "primary" | "ghost" | "danger" = "ghost"): React.CSSProperties => ({
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 7,
  border: "none",
  cursor: "pointer",
  background:
    variant === "primary" ? "var(--gg-primary, #2563eb)"
    : variant === "danger" ? "#dc2626"
    : "rgba(255,255,255,.1)",
  color: "#fff",
  whiteSpace: "nowrap",
});

const SECTION: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 10,
  padding: "16px 18px",
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  opacity: 0.45,
  marginBottom: 6,
  display: "block",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type OppData = {
  id: string;
  title: string | null;
  stage: string | null;
  pipeline: string | null;
  amount_cents: number | null;
  description: string | null;
  notes: string | null;
  priority: string | null;
  source: string | null;
  due_at: string | null;
  custom_fields?: Record<string, unknown> | null;
};

export type LocationEntry = {
  id: string;
  location_id: string;
  role: string;
  is_primary: boolean;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  place_name: string | null;
};

export type ContactTypeOption = {
  key: string;
  label: string;
};

export type PersonEntry = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary?: boolean;
};

export type UserEntry = {
  user_id: string;
  display: string;
  role: string;
};

export type ItemEntry = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price_cents: number;
};

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  retail_cents: number | null;
};

export type TenantUser = {
  id: string;
  display: string;
};

// ── Field editor ──────────────────────────────────────────────────────────────

export function OppFieldEditor({ opp, stages, contactTypes }: { opp: OppData; stages: { key: string; label: string }[]; contactTypes: ContactTypeOption[] }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function save(patch: Record<string, any>) {
    start(async () => {
      await updateOpportunityField(opp.id, patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div style={SECTION}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Details</span>
        {saved && <span style={{ fontSize: 12, color: "#4ade80" }}>Saved</span>}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={LABEL}>Title</label>
          <input
            style={INPUT}
            defaultValue={opp.title ?? ""}
            onBlur={(e) => save({ title: e.target.value })}
          />
        </div>

        {contactTypes.length > 0 && (
          <div>
            <label style={LABEL}>Pipeline</label>
            <select
              style={{ ...INPUT }}
              defaultValue={opp.pipeline ?? ""}
              onChange={(e) => save({ pipeline: e.target.value || null })}
            >
              <option value="">— Uncategorized —</option>
              {contactTypes.map((ct) => (
                <option key={ct.key} value={ct.key}>{ct.label}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Stage</label>
            <select
              style={{ ...INPUT }}
              defaultValue={opp.stage ?? ""}
              onChange={(e) => save({ stage: e.target.value })}
            >
              {stages.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={LABEL}>Priority</label>
            <select
              style={{ ...INPUT }}
              defaultValue={opp.priority ?? ""}
              onChange={(e) => save({ priority: e.target.value || null })}
            >
              <option value="">None</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Amount ($)</label>
            <input
              style={INPUT}
              type="number"
              min="0"
              step="0.01"
              defaultValue={opp.amount_cents != null ? (opp.amount_cents / 100).toFixed(2) : ""}
              placeholder="0.00"
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                save({ amount_cents: isNaN(v) ? null : Math.round(v * 100) });
              }}
            />
          </div>

          <div>
            <label style={LABEL}>Due Date</label>
            <input
              style={INPUT}
              type="date"
              defaultValue={opp.due_at ? opp.due_at.slice(0, 10) : ""}
              onChange={(e) => save({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
        </div>

        <div>
          <label style={LABEL}>Description</label>
          <textarea
            style={{ ...INPUT, minHeight: 72, resize: "vertical" }}
            defaultValue={opp.description ?? ""}
            onBlur={(e) => save({ description: e.target.value })}
          />
        </div>

        <div>
          <label style={LABEL}>Notes</label>
          <textarea
            style={{ ...INPUT, minHeight: 56, resize: "vertical" }}
            defaultValue={opp.notes ?? ""}
            onBlur={(e) => save({ notes: e.target.value })}
          />
        </div>

        <div>
          <label style={LABEL}>Source</label>
          <input
            style={INPUT}
            defaultValue={opp.source ?? ""}
            placeholder="doors, calls, referral…"
            onBlur={(e) => save({ source: e.target.value || null })}
          />
        </div>

      </div>
    </div>
  );
}

// ── People section ────────────────────────────────────────────────────────────

export function OppPeopleSection({
  opportunityId,
  people,
}: {
  opportunityId: string;
  people: PersonEntry[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; phone: string | null; email: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [, start] = useTransition();

  async function search(q: string) {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/crm/people/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      // GET /api/crm/people/search returns { rows: [{id, name, email, phone}], total }
      const rows: any[] = data.rows ?? data ?? [];
      setResults(
        rows.map((p: any) => ({
          id: p.id,
          name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id,
          phone: p.phone || null,
          email: p.email || null,
        }))
      );
    }
    setSearching(false);
  }

  function addPerson(personId: string) {
    start(async () => {
      await addPersonToOpportunity(opportunityId, personId);
      setQuery("");
      setResults([]);
    });
  }

  function removePerson(personId: string) {
    start(() => removePersonFromOpportunity(opportunityId, personId));
  }

  return (
    <div style={SECTION}>
      <span style={{ fontWeight: 700, fontSize: 15, display: "block", marginBottom: 12 }}>People</span>

      {/* Existing people */}
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {people.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <a href={`/crm/people/${p.id}`} style={{ fontWeight: 600, fontSize: 13, color: "inherit" }}>
                {p.name}
              </a>
              {p.is_primary && (
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.5, textTransform: "uppercase" }}>
                  primary
                </span>
              )}
              {(p.phone || p.email) && (
                <div style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace" }}>
                  {p.phone || p.email}
                </div>
              )}
            </div>
            {!p.is_primary && (
              <button style={BTN("danger")} onClick={() => removePerson(p.id)}>
                Remove
              </button>
            )}
          </div>
        ))}
        {people.length === 0 && (
          <p style={{ fontSize: 12, opacity: 0.4, margin: 0 }}>No people linked yet.</p>
        )}
      </div>

      {/* Search to add */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...INPUT, flex: 1 }}
          placeholder="Search people to add…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
        />
      </div>

      {results.length > 0 && (
        <div style={{
          marginTop: 4, background: "rgba(0,0,0,.4)", borderRadius: 8,
          border: "1px solid rgba(255,255,255,.1)", overflow: "hidden",
        }}>
          {results.slice(0, 6).map((r) => (
            <button
              key={r.id}
              onClick={() => addPerson(r.id)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", background: "transparent", border: "none",
                cursor: "pointer", color: "inherit", fontSize: 13,
              }}
            >
              {r.name}
              {(r.phone || r.email) && (
                <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 11 }}>{r.phone || r.email}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {searching && <p style={{ fontSize: 12, opacity: 0.4, marginTop: 4 }}>Searching…</p>}
    </div>
  );
}

// ── Assigned users section ────────────────────────────────────────────────────

export function OppUsersSection({
  opportunityId,
  assignedUsers,
  tenantUsers,
}: {
  opportunityId: string;
  assignedUsers: UserEntry[];
  tenantUsers: TenantUser[];
}) {
  const [selectedId, setSelectedId] = useState("");
  const [, start] = useTransition();

  const assignedIds = new Set(assignedUsers.map((u) => u.user_id));
  const available = tenantUsers.filter((u) => !assignedIds.has(u.id));

  function addUser() {
    if (!selectedId) return;
    start(async () => {
      await addUserToOpportunity(opportunityId, selectedId);
      setSelectedId("");
    });
  }

  function removeUser(userId: string) {
    start(() => removeUserFromOpportunity(opportunityId, userId));
  }

  return (
    <div style={SECTION}>
      <span style={{ fontWeight: 700, fontSize: 15, display: "block", marginBottom: 12 }}>Assigned Users</span>

      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {assignedUsers.map((u) => (
          <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, fontSize: 13 }}>
              {u.display}
              <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.45, textTransform: "uppercase" }}>
                {u.role}
              </span>
            </div>
            <button style={BTN("danger")} onClick={() => removeUser(u.user_id)}>
              Remove
            </button>
          </div>
        ))}
        {assignedUsers.length === 0 && (
          <p style={{ fontSize: 12, opacity: 0.4, margin: 0 }}>No users assigned.</p>
        )}
      </div>

      {available.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <select
            style={{ ...INPUT, flex: 1 }}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Add user…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>{u.display}</option>
            ))}
          </select>
          <button style={BTN("primary")} onClick={addUser} disabled={!selectedId}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Order items section ───────────────────────────────────────────────────────

export function OppItemsSection({
  opportunityId,
  items,
  products,
}: {
  opportunityId: string;
  items: ItemEntry[];
  products: ProductOption[];
}) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [, start] = useTransition();

  function addItem() {
    if (!selectedProductId) return;
    start(async () => {
      await addOpportunityItem(opportunityId, selectedProductId, parseInt(qty) || 1);
      setSelectedProductId("");
      setQty("1");
    });
  }

  function removeItem(itemId: string) {
    start(() => removeOpportunityItem(itemId, opportunityId));
  }

  function updateQty(itemId: string, newQty: number) {
    start(() => updateOpportunityItemQty(itemId, opportunityId, newQty));
  }

  return (
    <div style={SECTION}>
      <span style={{ fontWeight: 700, fontSize: 15, display: "block", marginBottom: 12 }}>Order Items</span>

      {items.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ opacity: 0.45, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 700 }}>Product</th>
              <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 700 }}>SKU</th>
              <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>Qty</th>
              <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>Unit</th>
              <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <td style={{ padding: "8px 0" }}>{item.product_name}</td>
                <td style={{ padding: "8px 4px", opacity: 0.5, fontFamily: "monospace", fontSize: 11 }}>
                  {item.sku ?? "—"}
                </td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>
                  <input
                    type="number"
                    min="1"
                    defaultValue={item.quantity}
                    onBlur={(e) => updateQty(item.id, parseInt(e.target.value) || 1)}
                    style={{ ...INPUT, width: 56, textAlign: "right", padding: "4px 6px" }}
                  />
                </td>
                <td style={{ padding: "8px 4px", textAlign: "right", opacity: 0.7 }}>
                  {item.unit_price_cents > 0 ? `$${(item.unit_price_cents / 100).toLocaleString()}` : "—"}
                </td>
                <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>
                  {item.unit_price_cents > 0
                    ? `$${((item.unit_price_cents * item.quantity) / 100).toLocaleString()}`
                    : "—"}
                </td>
                <td style={{ padding: "8px 0 8px 8px" }}>
                  <button style={BTN("danger")} onClick={() => removeItem(item.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items.length === 0 && (
        <p style={{ fontSize: 12, opacity: 0.4, margin: "0 0 12px" }}>No items yet.</p>
      )}

      {products.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            style={{ ...INPUT, flex: 2, minWidth: 160 }}
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Add product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.sku ? ` (${p.sku})` : ""}
                {p.retail_cents ? ` — $${(p.retail_cents / 100).toLocaleString()}` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ ...INPUT, width: 64 }}
            placeholder="Qty"
          />
          <button style={BTN("primary")} onClick={addItem} disabled={!selectedProductId}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Locations section ─────────────────────────────────────────────────────────

export function OppLocationsSection({
  locations: initial,
  opportunityId,
}: {
  locations: LocationEntry[];
  opportunityId: string;
}) {
  const [locs, setLocs] = useState<LocationEntry[]>(initial);
  const [adding, setAdding]   = useState(false);
  const [picker, setPicker]   = useState<LocationValue>(null);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function handleAdd() {
    if (!picker || picker.type !== "location") return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: picker.locationId }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Failed to add location"); setSaving(false); return; }
      // Refresh list
      const refreshRes = await fetch(`/api/crm/opportunities/${opportunityId}/locations`);
      if (refreshRes.ok) {
        const rows = await refreshRes.json();
        setLocs(rows.map((r: any) => ({
          id: r.id, location_id: r.location_id, role: r.role, is_primary: r.is_primary,
          address_line1: null, city: null, state: null, postal_code: null, notes: null, place_name: null,
          ...parseDisplay(r.location_display),
        })));
      }
      setPicker(null);
      setAdding(false);
    } catch { setErr("Network error"); }
    setSaving(false);
  }

  async function handleRemove(entryId: string, locationId: string) {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/locations/${entryId}`, { method: "DELETE" });
    if (res.ok) setLocs((prev) => prev.filter((l) => l.id !== entryId));
  }

  async function handlePromote(entryId: string) {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/locations/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_primary: true }),
    });
    if (res.ok) setLocs((prev) => prev.map((l) => ({ ...l, is_primary: l.id === entryId })));
  }

  function parseDisplay(display: string | null): Partial<LocationEntry> {
    // Best-effort parse from display text for local state refresh
    return {};
  }

  const dim = "rgb(100 116 139)";

  return (
    <div style={SECTION}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Locations</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ background: "none", border: "none", color: dim, fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            + Add Location
          </button>
        )}
      </div>

      {locs.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: adding ? 12 : 0 }}>
          {locs.map((loc) => {
            const addr = [loc.place_name ?? loc.address_line1, loc.city, loc.state, loc.postal_code]
              .filter(Boolean).join(", ");
            return (
              <div key={loc.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "inherit" }}>{addr || "(no address)"}</span>
                </div>
                {loc.is_primary ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                    background: "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
                    color: "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)",
                    border: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)",
                    flexShrink: 0,
                  }}>Primary</span>
                ) : (
                  <button
                    onClick={() => handlePromote(loc.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: dim, fontSize: 11, padding: 0, flexShrink: 0 }}
                    title="Make primary"
                  >
                    Set primary
                  </button>
                )}
                <button
                  onClick={() => handleRemove(loc.id, loc.location_id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: dim, fontSize: 16, padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div style={{ marginTop: locs.length > 0 ? 4 : 0 }}>
          <LocationPicker value={picker} onChange={setPicker} mode="compact" />
          {err && <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 6 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setAdding(false); setPicker(null); setErr(null); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: dim, fontSize: 13, padding: "5px 12px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!picker || picker.type !== "location" || saving}
              style={{
                background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
                border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13,
                padding: "6px 16px", cursor: saving ? "not-allowed" : "pointer",
                opacity: (!picker || picker.type !== "location" || saving) ? 0.5 : 1,
              }}
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {locs.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: dim, fontStyle: "italic" }}>No locations added</div>
      )}
    </div>
  );
}
