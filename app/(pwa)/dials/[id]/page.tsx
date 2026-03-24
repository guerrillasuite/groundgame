// app/(pwa)/dials/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export const dynamic = "force-dynamic";

type CallList = {
  id: string;
  name: string | null;
  description: string | null;
  list_mode: string | null;
  total_targets: number | null;
  updated_at: string | null;
};

const JOIN_TABLE =
  process.env.NEXT_PUBLIC_WALKLIST_CALL_JOIN_TABLE ?? "walklist_items";

function fmtUpdated(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "—" : dt.toLocaleString();
}

export default async function DialListStart({
  params,
}: {
  params: { id: string };
}) {
  const { id: tenantId } = await getTenant();
  const supabase = makeSb(tenantId);

  // Query walklists directly (tenant-scoped) — api_call_lists view has no tenant_id
  // and would leak cross-tenant data when used with the service role key.
  const { data, error } = await supabase
    .from("walklists")
    .select("id,name,description,mode,total_targets,updated_at")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (error) {
    // PGRST116 => hidden by RLS or not found
    if ((error as any).code === "PGRST116") return notFound();
    return (
      <div className="stack">
        <div className="list-item">
          <h4>Error loading list</h4>
          <p className="muted">{error.message}</p>
        </div>
        <Link
          href="/dials"
          className="press-card"
          style={{ gridTemplateColumns: "1fr" }}
        >
          ‹ Back to Dials
        </Link>
      </div>
    );
  }

  if (!data) return notFound();
  // Map walklists columns to CallList shape
  const wl: CallList = {
    id: (data as any).id,
    name: (data as any).name,
    description: (data as any).description,
    list_mode: (data as any).mode,
    total_targets: (data as any).total_targets,
    updated_at: (data as any).updated_at,
  };

  // Prefer precomputed total_targets, fall back to join-table count (tenant-scoped)
  let targets =
    wl.total_targets != null
      ? wl.total_targets
      : (
          await supabase
            .from(JOIN_TABLE)
            .select("id", { head: true, count: "exact" })
            .eq("walklist_id", wl.id)
            .eq("tenant_id", tenantId)
        ).count ?? 0;

  const updated = fmtUpdated(wl.updated_at);

  return (
    <div className="stack">
      <div className="list-item">
        <h4 style={{ marginBottom: 4 }}>{wl.name || "Untitled List"}</h4>
        {wl.description ? <p className="muted">{wl.description}</p> : null}
        <p className="muted" style={{ marginTop: 6 }}>
          {targets} targets
          {updated ? ` • Updated ${updated}` : null}
        </p>
      </div>

      {targets > 0 ? (
        <Link
          href={`/dials/${wl.id}/0`}
          className="press-card"
          style={{ gridTemplateColumns: "1fr" }}
          role="button"
          aria-label="Start Calling"
        >
          Start Calling
        </Link>
      ) : (
        <div className="list-item">
          <h4>No targets yet</h4>
          <p className="muted">Add people to this list, then come back to start dialing.</p>
        </div>
      )}

      <Link
        href="/dials"
        className="press-card"
        style={{ gridTemplateColumns: "1fr" }}
        role="button"
        aria-label="Back to Dials"
      >
        ‹ Back to Dials
      </Link>
    </div>
  );
}
