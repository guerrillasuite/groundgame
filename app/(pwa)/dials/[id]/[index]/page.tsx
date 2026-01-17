// app/(pwa)/dials/[id]/[index]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase/client";

type Person = {
  person_id: string;
  walklist_item_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  occupation?: string | null;
  employer?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

const RESULTS = [
  'connected','no_answer','left_voicemail','bad_number','wrong_person',
  'call_back','do_not_call','not_interested','moved','other'
] as const;
type ResultKey = typeof RESULTS[number];

// 🔒 TEMP: hard-code tenant for all writes in test env.
// Set NEXT_PUBLIC_TEST_TENANT_ID in your env, or replace the default literal here.
const FORCED_TENANT_ID =
  process.env.NEXT_PUBLIC_TEST_TENANT_ID ?? "00000000-0000-0000-0000-000000000000";

/** Server-verified tenant id (for reads). */
async function getTenantIdFromServer(): Promise<string | null> {
  try {
    const res = await fetch("/api/tenant-id", { cache: "no-store" });
    const body = await res.json();
    return (body?.tenant_id as string) ?? null;
  } catch {
    return null;
  }
}

/** JWT tenant id (for writes) — kept for reference, not used while forced. */
async function getTenantIdFromJwt(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    const meta =
      (user?.app_metadata as any)?.tenant_id ??
      (user?.user_metadata as any)?.tenant_id;
    return meta ? String(meta) : null;
  } catch {
    return null;
  }
}

/** Resolve a reliable tenant UUID for writes (kept for reference). */
async function resolveTenantIdForWrites(effectiveWalklistId?: string): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    const t =
      (data?.user?.app_metadata as any)?.tenant_id ??
      (data?.user?.user_metadata as any)?.tenant_id ?? null;
    if (t) return String(t);
  } catch {}

  try {
    const res = await fetch("/api/tenant-id", { cache: "no-store" });
    const body = await res.json();
    if (body?.tenant_id) return String(body.tenant_id);
  } catch {}

  if (effectiveWalklistId) {
    const wl = await supabase
      .from("walklists")
      .select("tenant_id")
      .eq("id", effectiveWalklistId)
      .maybeSingle();
    const t = wl.data?.tenant_id;
    if (t) return String(t);
  }

  throw new Error("Missing tenant id for writes");
}

/** Fallback client-side resolver if needed anywhere. */
async function resolveTenantId(): Promise<string | null> {
  const server = await getTenantIdFromServer();
  if (server) return server;

  const jwt = await getTenantIdFromJwt();
  if (jwt) return jwt;

  try {
    if (typeof window !== "undefined") {
      const ls = localStorage.getItem("tenantId") ?? localStorage.getItem("tenant_id");
      if (ls) return String(ls);
      const parts = window.location.hostname.split(".");
      if (parts.length > 2) return parts[0];
    }
  } catch {}

  return process.env.NEXT_PUBLIC_TEST_TENANT_ID ?? null;
}

/** Map api_call_lists.id -> underlying walklists.id if needed */
async function resolveEffectiveWalklistId(id: string): Promise<string> {
  // If items exist with this id, it IS the underlying id
  const quick = await supabase
    .from('walklist_items')
    .select('id', { head: true, count: 'exact' })
    .eq('walklist_id', id);

  if (!quick.error && (quick.count ?? 0) > 0) return id;

  // Otherwise try to map via api_call_lists
  const probe = await supabase
    .from('api_call_lists')
    .select('*')
    .eq('id', id)
    .maybeSingle();   // safe: 0 or 1 row

  if (!probe.error && probe.data) {
    const row = probe.data as Record<string, any>;
    for (const k of ['walklist_id', 'list_id', 'parent_walklist_id', 'source_walklist_id']) {
      if (row[k]) return String(row[k]);
    }
  }
  return id; // fallback
}

export default function CallScreen({ params }: { params: { id: string; index: string } }) {
  const router = useRouter();
  const idxFromUrl = Number(params.index);

  const [idx, setIdx] = useState<number>(
    Number.isFinite(idxFromUrl) && idxFromUrl >= 0 ? idxFromUrl : 0
  );

  const [people, setPeople] = useState<Person[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [mkOpp, setMkOpp] = useState(false);

  // opportunity fields
  const [oppTitle, setOppTitle] = useState('');
  const [oppStage, setOppStage] =
    useState<'new'|'contacted'|'qualified'|'proposal'|'won'|'lost'|''>('');
  const [oppValue, setOppValue] = useState<number | ''>('');
  const [oppDue, setOppDue] = useState<string>(''); // yyyy-mm-dd
  const [oppPriority, setOppPriority] =
    useState<'low'|'normal'|'high'|''>('');
  const [oppNotes, setOppNotes] = useState('');

  // Reset when moving to a different target
  useEffect(() => {
    setStartedAt(null);
    setResult('');
    setNotes('');
    setMkOpp(false);
    setOppTitle('');
    setOppStage('');
    setOppValue('');
    setOppDue('');
    setOppPriority('');
    setOppNotes('');
  }, [idx]);

  // Load people — RPC first, then tables. Always attach walklist_item_id.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr(null);
        setPeople(null);

        const tenantId = await getTenantIdFromServer(); // ok if null for read-only param
        const effectiveWalklistId = await resolveEffectiveWalklistId(params.id);

        // 1) RPC
        const rpc = await supabase.rpc("gs_get_walklist_people_v1", {
          _tenant_id: tenantId,
          _walklist_id: effectiveWalklistId,
        });

        if (!rpc.error) {
          const raw = Array.isArray(rpc.data) ? rpc.data : (rpc.data as any)?.people ?? [];
          if (raw && raw.length) {
            // Map to Person
            const mapped: Person[] = raw.map((r: any) => ({
              person_id: r.person_id ?? r.id,
              first_name: r.first_name ?? null,
              last_name: r.last_name ?? null,
              occupation: r.occupation ?? null,
              employer: r.employer ?? null,
              phone: r.phone ?? null,
              email: r.email ?? null,
              address: r.address ?? null,
            }));

            // Attach walklist_item_id mapping for this list
            const joinMapRes = await supabase
              .from('walklist_items')
              .select('id, person_id')
              .eq('walklist_id', effectiveWalklistId);
            if (joinMapRes.error) throw joinMapRes.error;

            const wlItemByPerson = new Map<string, string>(
              (joinMapRes.data ?? []).map((j) => [j.person_id, j.id])
            );
            const mappedWithJoin: Person[] = mapped.map((r) => ({
              ...r,
              walklist_item_id: wlItemByPerson.get(r.person_id) ?? null,
            }));

            if (!cancelled) {
              setPeople(mappedWithJoin);
              const clamped = Math.max(0, Math.min(idx, Math.max(0, mappedWithJoin.length - 1)));
              if (clamped !== idx) setIdx(clamped);
            }
            return; // Use RPC result
          }
        }

        // 2) Fallback: tables (ordered by position) — already includes walklist_item_id
        const join = await supabase
          .from("walklist_items")
          .select("id, person_id, position")
          .eq("walklist_id", effectiveWalklistId)
          .order("position", { ascending: true, nullsFirst: true });

        if (join.error) throw join.error;

        const ids = (join.data ?? []).map(j => j.person_id).filter(Boolean) as string[];
        if (ids.length === 0) { if (!cancelled) setPeople([]); return; }

        const ppl = await supabase
          .from("people")
          .select("id, first_name, last_name, occupation, phone, email, address")
          .in("id", ids);

        if (ppl.error) throw ppl.error;

        const byId = new Map<string, any>((ppl.data ?? []).map(r => [r.id, r]));
        const ordered: Person[] = (join.data ?? [])
          .map(j => {
            const r = byId.get(j.person_id);
            return r ? ({
              person_id: r.id,
              walklist_item_id: j.id,
              first_name: r.first_name ?? null,
              last_name: r.last_name ?? null,
              occupation: r.occupation ?? null,
              employer: null,
              phone: r.phone ?? null,
              email: r.email ?? null,
              address: r.address ?? null,
            } as Person) : null;
          })
          .filter(Boolean) as Person[];

        if (!cancelled) {
          setPeople(ordered);
          const clamped = Math.max(0, Math.min(idx, Math.max(0, ordered.length - 1)));
          if (clamped !== idx) setIdx(clamped);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load");
          setPeople([]);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const p = useMemo(() => (people && people[idx]) || null, [people, idx]);

  if (err) return <p className="muted">Error: {err}</p>;
  if (!people) return <p className="muted">Loading…</p>;
  if (!p) {
    return (
      <div className="stack">
        <div className="list-item">
          <h4>Done with this list</h4>
          <p className="muted">You worked through all targets.</p>
        </div>
        <Link href={`/dials/${params.id}`} className="press-card" style={{ gridTemplateColumns: '1fr' }}>
          ‹ Back to list
        </Link>
      </div>
    );
  }

  const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown';
  const onStartInteraction = () => { if (!startedAt) setStartedAt(Date.now()); };

  async function saveAndNext() {
    try {
      const effectiveWalklistId = await resolveEffectiveWalklistId(params.id);

      // 🔒 Use ONE forced tenant value for all writes
      const tenantId = FORCED_TENANT_ID;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? '00000000-0000-0000-0000-000000000000';
      const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

      // 1) Update person (safe no-op if unchanged)
      const { error: updErr } = await supabase.rpc('gs_update_person_v1', {
        _tenant_id: tenantId,
        _person: {
          id: p.person_id,
          first_name: p.first_name,
          last_name: p.last_name,
          occupation: p.occupation,
          employer: p.employer,
          phone: p.phone,
          email: p.email,
        },
      });
      if (updErr) throw updErr;

      // 2) Create stop — include forced tenant and effective ids
      const { data: stopData, error: stopErr } = await supabase.rpc('gs_create_stop_v1', {
        _tenant_id: tenantId,
        _payload: {
          tenant_id: tenantId,
          walklist_id: effectiveWalklistId,
          walklist_item_id: p.walklist_item_id ?? null,
          person_id: p.person_id,
          user_id: userId,
          channel: 'call',
          result,
          notes,
          duration_sec: duration,
        },
      });
      if (stopErr) throw stopErr;

      // Normalize stopId from any return shape
      let stopId: string | null =
        (Array.isArray(stopData) ? stopData[0]?.stop_id ?? stopData[0]?.id : null) ||
        (stopData && (stopData.stop_id ?? stopData.id)) ||
        null;

      // Fallback: last stop for this person/list/user (no .single/.maybeSingle)
      if (!stopId) {
        const recent = await supabase
          .from('stops')
          .select('id')
          .eq('walklist_id', effectiveWalklistId)
          .eq('person_id', p.person_id)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (recent.error) throw recent.error;
        stopId = recent.data?.[0]?.id ?? null;
      }
      if (!stopId) throw new Error('Could not resolve stop id');

      // 3) Optional opportunity — use the SAME forced tenant
      if (mkOpp && stopId) {
        const title = oppTitle.trim() || `Follow-up: ${fullName}`;
        const amountCents = oppValue === '' ? null : Math.round(Number(oppValue) * 100);
        const dueAt = oppDue ? new Date(`${oppDue}T12:00:00`) : null;

        const { error: oppErr } = await supabase.rpc('gs_create_opportunity_v1', {
          _tenant_id: tenantId,
          _payload: {
            tenant_id: tenantId,
            stop_id: stopId,
            person_id: p.person_id,
            title,
            stage: oppStage || null,
            amount_cents: amountCents,
            due_at: dueAt ? dueAt.toISOString() : null,
            priority: oppPriority || null,
            description: oppNotes || null,
            source: 'walklist',
          },
        });
        if (oppErr) throw oppErr;
      }

      router.replace(`/dials/${params.id}/${idx + 1}`);
      router.refresh();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <Link href={`/dials/${params.id}`} className="press-card" style={{ gridTemplateColumns: '1fr' }}>
          ‹ Back
        </Link>
        <div className="press-card" style={{ gridTemplateColumns: '1fr' }}>
          {idx + 1} of {people.length}
        </div>
      </div>

      <div className="list-item">
        <h4 style={{ marginBottom: 4 }}>{fullName}</h4>
        <p className="muted">
          {p.occupation || '—'}{p.employer ? ` • ${p.employer}` : ''}
        </p>
        {p.address && <p className="muted" style={{ marginTop: 6 }}>{p.address}</p>}

        <div className="row" style={{ marginTop: 10 }}>
          {p.phone && (
            <a
              className="press-card"
              style={{ gridTemplateColumns: '1fr' }}
              href={`tel:${encodeURIComponent(p.phone)}`}
              onClick={onStartInteraction}
            >
              Call
            </a>
          )}
          {p.email && (
            <a
              className="press-card"
              style={{ gridTemplateColumns: '1fr' }}
              href={`mailto:${encodeURIComponent(p.email)}`}
              onClick={onStartInteraction}
            >
              Email
            </a>
          )}
        </div>
      </div>

      <div className="list-item">
        <label htmlFor="callResult" className="muted">Call result</label>
        <select
          id="callResult"
          className="gg-field gg-select"
          value={result}
          onChange={(e) => {
            if (!startedAt) setStartedAt(Date.now());
            setResult(e.target.value);
          }}
        >
          <option value="" disabled>Select…</option>
          {RESULTS.map((r) => (
            <option key={r} value={r}>
              {r.replaceAll('_', ' ')}
            </option>
          ))}
        </select>

        <label htmlFor="callNotes" className="muted" style={{ marginTop: 12 }}>Notes</label>
        <textarea
          id="callNotes"
          rows={3}
          className="gg-field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes for this call…"
        />

        <label className="row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={mkOpp}
            onChange={(e) => setMkOpp(e.target.checked)}
          />
          <span className="muted">Create opportunity linked to this call</span>
        </label>

        {mkOpp && (
          <div className="list-item" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="oppTitle" className="muted">Title</label>
              <input
                id="oppTitle"
                className="gg-field"
                value={oppTitle}
                onChange={(e) => setOppTitle(e.target.value)}
                placeholder={`${fullName}`}
              />
            </div>

            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="oppStage" className="muted">Stage</label>
                <select
                  id="oppStage"
                  className="gg-field gg-select"
                  value={oppStage}
                  onChange={(e) => setOppStage(e.target.value as any)}
                >
                  <option value="" disabled>Select…</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>

              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="oppValue" className="muted">Value (USD)</label>
                <input
                  id="oppValue"
                  type="number"
                  min={0}
                  step={1}
                  className="gg-field"
                  placeholder="e.g. 250"
                  value={oppValue}
                  onChange={(e) => setOppValue(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>

              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="oppDue" className="muted">Follow-up date</label>
                <input
                  id="oppDue"
                  type="date"
                  className="gg-field"
                  value={oppDue}
                  onChange={(e) => setOppDue(e.target.value)}
                />
              </div>

              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="oppPriority" className="muted">Priority</label>
                <select
                  id="oppPriority"
                  className="gg-field gg-select"
                  value={oppPriority}
                  onChange={(e) => setOppPriority(e.target.value as any)}
                >
                  <option value="" disabled>Select…</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label htmlFor="oppNotes" className="muted">Opportunity notes</label>
              <textarea
                id="oppNotes"
                rows={3}
                className="gg-field"
                value={oppNotes}
                onChange={(e) => setOppNotes(e.target.value)}
                placeholder="Context, commitment, next steps…"
              />
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="press-card"
            style={{ gridTemplateColumns: '1fr' }}
            onClick={() => { router.replace(`/dials/${params.id}/${idx + 1}`); router.refresh(); }}
            type="button"
          >
            Skip
          </button>

          <button
            className="press-card"
            style={{ gridTemplateColumns: '1fr' }}
            onClick={saveAndNext}
            disabled={!result}
            title={result ? '' : 'Select a call result first'}
            type="button"
          >
            Save & Next
          </button>
        </div>
      </div>

      <style jsx>{`
        .gg-field {
          width: 100%;
          margin-top: 6px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.04);
          color: var(--brand-text, #EEF2F6);
        }
        .gg-field::placeholder { color: var(--brand-muted, #8696A8); }
        .gg-field:focus { outline: 2px solid #60A5FA; outline-offset: 2px; }
        .gg-select { appearance: none; -webkit-appearance: none; -moz-appearance: none; }
        .gg-select option { background-color: #1C2430; color: #EEF2F6; }
      `}</style>
    </div>
  );
}
