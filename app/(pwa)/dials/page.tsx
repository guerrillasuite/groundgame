// app/(pwa)/dials/page.tsx

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

type ApiWalklist = {
  id: string;
  name: string | null;
  description: string | null;
  list_mode: string | null;
  total_targets: number | null;
  updated_at: string | null;
};

const JOIN_TABLE =
  process.env.NEXT_PUBLIC_WALKLIST_CALL_JOIN_TABLE ?? "walklist_items";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleDateString();
}

export default async function DialsPage() {
  const { id: tenantId } = await getTenant();
  const supabase = makeSb(tenantId);

  let errorMessage: string | null = null;
  let rows: ApiWalklist[] = [];

  // Query walklists directly (tenant-scoped) instead of api_call_lists view
  // which has no tenant_id column and would leak cross-tenant data with service role key.
  const { data, error } = await supabase
    .from("walklists")
    .select("id,name,description,mode,total_targets,updated_at")
    .eq("tenant_id", tenantId)
    .eq("mode", "call")
    .order("updated_at", { ascending: false });

  if (error) {
    errorMessage = error.message;
  } else {
    rows = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      list_mode: r.mode,
      total_targets: r.total_targets,
      updated_at: r.updated_at,
    })) as ApiWalklist[];
  }

  const callLists = rows;

  // Counts map, favoring the precomputed `total_targets`, falling back to join table count
  const counts = new Map<string, number>();

  // Pre-fill with total_targets when provided
  for (const wl of callLists) {
    if (wl.total_targets != null) counts.set(wl.id, wl.total_targets);
  }

  // Backfill any missing counts from the join table
  await Promise.all(
    callLists.map(async (wl) => {
      if (counts.has(wl.id)) return;
      const { count } = await supabase
        .from(JOIN_TABLE)
        .select("id", { head: true, count: "exact" })
        .eq("walklist_id", wl.id)
        .eq("tenant_id", tenantId);
      counts.set(wl.id, count ?? 0);
    })
  );

  return (
    <section style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Call Lists</h1>

      {errorMessage ? (
        <div
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm"
          style={{ marginBottom: 8 }}
        >
          Could not load call lists: {errorMessage}
        </div>
      ) : null}

      {callLists.length === 0 ? (
        <div style={{ opacity: 0.85 }}>
          <p>No call lists found.</p>
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
          {callLists.map((wl) => (
            <Link
              key={wl.id}
              href={`/dials/${wl.id}`}
              className="gg-item gg-item--button"
            >
              <span className="gg-ico">
                <Icon name="phone" size={20} aria-hidden />
              </span>

              <div className="gg-text" style={{ flex: 1 }}>
                <h2>{wl.name ?? "(Untitled call list)"}</h2>
                <p>
                  {(counts.get(wl.id) ?? 0)} targets • Updated {fmtDate(wl.updated_at)}
                </p>
                {wl.description ? (
                  <p className="opacity-80" style={{ marginTop: 2 }}>
                    {wl.description}
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
