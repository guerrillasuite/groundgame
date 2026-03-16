import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import Link from "next/link";

const tabs = [
  { href: "/crm/account",          label: "Account" },
  { href: "/crm/account/history",  label: "History" },
  { href: "/crm/account/settings", label: "Settings" },
  { href: "/crm/account/auth",     label: "Login/Logout" },
];

function formatMoney(cents: number | null) {
  if (!cents) return null;
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relTime(iso: string | null) {
  if (!iso) return "";
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

export default async function HistoryPage() {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const [listsRes, oppsRes, surveysRes] = await Promise.all([
    sb.from("walklists").select("id, name, mode, status, total_targets, updated_at")
      .eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(5),
    sb.from("opportunities").select("id, title, stage, amount_cents, updated_at")
      .eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(5),
    sb.from("surveys").select("id, title, active, updated_at")
      .eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(5),
  ]);

  const lists   = listsRes.data   ?? [];
  const opps    = oppsRes.data    ?? [];
  const surveys = surveysRes.data ?? [];

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Recent Activity</h2>
      <div className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href}
            className={`tab${t.href === "/crm/account/history" ? " active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {/* Lists */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Lists</h3>
          <Link href="/crm/lists" style={{ fontSize: 13, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
        </div>
        {lists.length === 0
          ? <p className="muted" style={{ margin: 0 }}>No lists yet.</p>
          : <div className="list">
              {lists.map((l: any) => (
                <Link key={l.id} href={`/crm/lists/${l.id}`} className="list-item" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0 }}>{l.name}</h4>
                    <span className="muted" style={{ fontSize: 12 }}>{relTime(l.updated_at)}</span>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    {l.mode ?? "—"} · {l.status ?? "—"} · {l.total_targets ?? 0} targets
                  </p>
                </Link>
              ))}
            </div>
        }
      </div>

      {/* Opportunities */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Opportunities</h3>
          <Link href="/crm/opportunities" style={{ fontSize: 13, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
        </div>
        {opps.length === 0
          ? <p className="muted" style={{ margin: 0 }}>No opportunities yet.</p>
          : <div className="list">
              {opps.map((o: any) => (
                <Link key={o.id} href={`/crm/opportunities/${o.id}`} className="list-item" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0 }}>{o.title ?? "Untitled"}</h4>
                    <span className="muted" style={{ fontSize: 12 }}>{relTime(o.updated_at)}</span>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    {o.stage ?? "—"}{o.amount_cents ? ` · ${formatMoney(o.amount_cents)}` : ""}
                  </p>
                </Link>
              ))}
            </div>
        }
      </div>

      {/* Surveys */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Surveys</h3>
          <Link href="/crm/survey" style={{ fontSize: 13, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
        </div>
        {surveys.length === 0
          ? <p className="muted" style={{ margin: 0 }}>No surveys yet.</p>
          : <div className="list">
              {surveys.map((s: any) => (
                <Link key={s.id} href={`/crm/survey/${s.id}/results`} className="list-item" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0 }}>{s.title}</h4>
                    <span className="muted" style={{ fontSize: 12 }}>{relTime(s.updated_at)}</span>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>{s.active ? "Active" : "Inactive"}</p>
                </Link>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
