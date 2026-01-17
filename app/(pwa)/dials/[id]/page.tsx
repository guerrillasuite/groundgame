// app/(pwa)/dials/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

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
  const supabase = await getServerSupabase();

  // Pull the call list from the server-side view that carries list_mode + totals
  const { data, error } = await supabase
    .from("api_call_lists")
    .select("id,name,description,list_mode,total_targets,updated_at")
    .eq("id", params.id)
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
  const wl = data as CallList;

  // Prefer precomputed total_targets, fall back to join-table count
  let targets =
    wl.total_targets != null
      ? wl.total_targets
      : (
          await supabase
            .from(JOIN_TABLE)
            .select("id", { head: true, count: "exact" })
            .eq("walklist_id", wl.id)
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
