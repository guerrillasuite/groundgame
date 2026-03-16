"use client";

import { useState, useTransition } from "react";
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
  amount_cents: number | null;
  description: string | null;
  notes: string | null;
  priority: string | null;
  source: string | null;
  due_at: string | null;
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

export function OppFieldEditor({ opp, stages }: { opp: OppData; stages: { key: string; label: string }[] }) {
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
