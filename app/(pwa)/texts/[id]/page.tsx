// app/(pwa)/texts/[id]/page.tsx
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

function fmtUpdated(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "—" : dt.toLocaleString();
}

export default async function TextListStart({ params }: { params: { id: string } }) {
  const { id: tenantId } = await getTenant();
  const supabase = makeSb(tenantId);

  const { data, error } = await supabase
    .from("walklists")
    .select("id,name,description,mode,total_targets,updated_at")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return notFound();

  const wl = data as any;

  let targets = wl.total_targets != null
    ? wl.total_targets
    : (
        await supabase
          .from("walklist_items")
          .select("id", { head: true, count: "exact" })
          .eq("walklist_id", wl.id)
          .eq("tenant_id", tenantId)
      ).count ?? 0;

  const updated = fmtUpdated(wl.updated_at);

  return (
    <div className="stack">
      <div className="list-item">
        <h4 style={{ marginBottom: 4 }}>{wl.name || "Untitled List"}</h4>
        {wl.description ? (
          <p className="muted" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{wl.description}</p>
        ) : null}
        <p className="muted" style={{ marginTop: 6 }}>
          {targets} contacts
          {updated ? ` • Updated ${updated}` : null}
        </p>
      </div>

      {targets > 0 ? (
        <Link
          href={`/texts/${wl.id}/0`}
          className="press-card"
          style={{ gridTemplateColumns: "1fr" }}
          role="button"
          aria-label="Start Texting"
        >
          Start Texting
        </Link>
      ) : (
        <div className="list-item">
          <h4>No contacts yet</h4>
          <p className="muted">Add people to this list, then come back to start texting.</p>
        </div>
      )}

      <Link
        href="/texts"
        className="press-card"
        style={{ gridTemplateColumns: "1fr" }}
        role="button"
        aria-label="Back to Text Lists"
      >
        ‹ Back to Text Lists
      </Link>
    </div>
  );
}
