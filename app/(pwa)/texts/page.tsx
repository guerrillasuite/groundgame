// app/(pwa)/texts/page.tsx

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { Icon } from "../../components/Icon";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleDateString();
}

export default async function TextsPage() {
  const { id: tenantId } = await getTenant();
  const supabase = makeSb(tenantId);

  const { data, error } = await supabase
    .from("walklists")
    .select("id,name,description,mode,total_targets,updated_at")
    .eq("tenant_id", tenantId)
    .eq("mode", "text")
    .order("updated_at", { ascending: false });

  const lists = data ?? [];

  const counts = new Map<string, number>();
  for (const wl of lists) {
    if ((wl as any).total_targets != null) counts.set((wl as any).id, (wl as any).total_targets);
  }
  await Promise.all(
    lists.map(async (wl: any) => {
      if (counts.has(wl.id)) return;
      const { count } = await supabase
        .from("walklist_items")
        .select("id", { head: true, count: "exact" })
        .eq("walklist_id", wl.id)
        .eq("tenant_id", tenantId);
      counts.set(wl.id, count ?? 0);
    })
  );

  return (
    <section style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Text Lists</h1>

      {error && (
        <div style={{ marginBottom: 8, padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 14 }}>
          Could not load text lists: {error.message}
        </div>
      )}

      {lists.length === 0 ? (
        <div style={{ opacity: 0.85 }}>
          <p>No text lists found.</p>
          <p>
            Create one in{" "}
            <Link href="/crm/lists" style={{ textDecoration: "underline" }}>
              CRM → Lists
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="gg-list" style={{ marginTop: 8 }}>
          {lists.map((wl: any) => (
            <Link
              key={wl.id}
              href={`/texts/${wl.id}`}
              className="gg-item gg-item--button"
            >
              <span className="gg-ico">
                <Icon name="message" size={20} aria-hidden />
              </span>

              <div className="gg-text" style={{ flex: 1 }}>
                <h2>{wl.name ?? "(Untitled text list)"}</h2>
                <p>
                  {counts.get(wl.id) ?? 0} contacts · Updated {fmtDate(wl.updated_at)}
                </p>
                {wl.description ? (
                  <p className="opacity-80" style={{ marginTop: 2, fontSize: 13 }}>
                    {wl.description.length > 80 ? wl.description.slice(0, 80) + "…" : wl.description}
                  </p>
                ) : null}
              </div>

              <Icon name="chev" className="gg-chevron" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
