"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { type FeatureKey, planFromFeatures } from "@/lib/features";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  features: FeatureKey[];
  createdAt: string;
};

const PLAN_COLORS: Record<string, string> = {
  pro:    "#1d4ed8",
  basic:  "#7c3aed",
  custom: "#059669",
};

export default function TenantListPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setErr("Not authenticated"); setLoading(false); return; }

      const res = await fetch("/api/crm/admin/tenants", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setErr("Failed to load tenants"); setLoading(false); return; }
      const data = await res.json();
      setTenants(data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="stack"><p className="text-dim">Loading tenants…</p></div>;
  if (err) return <div className="stack"><p style={{ color: "#f87171" }}>{err}</p></div>;

  return (
    <div className="stack">
      <div>
        <h2 style={{ margin: 0 }}>Tenants</h2>
        <p className="text-dim" style={{ marginTop: 6 }}>
          Manage tenant settings, plans, and feature access.
        </p>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {tenants.map((t) => {
          const displayPlan = planFromFeatures(t.features);
          const planColor = PLAN_COLORS[displayPlan] ?? "#6b7280";
          return (
            <div key={t.id} className="list-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{t.name}</strong>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                    background: planColor + "22", color: planColor, textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {displayPlan}
                  </span>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>{t.slug}</p>
              </div>
              <Link
                href={`/crm/admin/tenants/${t.id}`}
                className="press-card"
                style={{ padding: "6px 14px", gridTemplateColumns: "1fr", minWidth: 0, width: "auto", fontSize: 13 }}
              >
                Edit →
              </Link>
            </div>
          );
        })}
      </div>

      {tenants.length === 0 && (
        <p className="text-dim">No tenants found.</p>
      )}
    </div>
  );
}
