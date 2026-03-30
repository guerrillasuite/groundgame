// app/(pwa)/dials/[id]/[index]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase/client";
import KnockSurvey from "@/app/components/KnockSurvey";
import { buildColorMap, DEFAULT_DISPO_CONFIG, type DispositionConfig } from "@/lib/dispositionConfig";
// Callback reminder state is inline (date/time inputs revealed on call_back result)

type Person = {
  person_id: string | null;
  company_id?: string | null;
  walklist_item_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  occupation?: string | null;
  employer?: string | null;
  phone?: string | null;
  phone_cell?: string | null;
  phone_landline?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

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

  // Disposition config (loaded from survey endpoint)
  const [dispoConfig, setDispoConfig] = useState<DispositionConfig>(DEFAULT_DISPO_CONFIG);

  // Capture mode (fetched once per list)
  const [callCaptureMode, setCallCaptureMode] = useState<string | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);

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

  // Callback reminder (shown inline when result = call_back)
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('09:00');
  const [callbackNote, setCallbackNote] = useState('');

  const [showProfile, setShowProfile] = useState(false);
  const [dialProfile, setDialProfile] = useState<{
    phone?: string | null; phone_cell?: string | null; phone_landline?: string | null;
    email?: string | null; occupation_title?: string | null; company_name?: string | null;
    notes?: string | null; household_name?: string | null;
    address?: string | null; mailing_address?: string | null;
  } | null>(null);
  const [dialProfileLoading, setDialProfileLoading] = useState(false);

  // Reset when moving to a different target
  useEffect(() => {
    setStartedAt(null);
    setResult('');
    setNotes('');
    setMkOpp(false);
    setShowSurvey(false);
    setSurveyDone(false);
    setShowProfile(false);
    setDialProfile(null);
    setOppTitle('');
    setOppStage('');
    setOppValue('');
    setOppDue('');
    setOppPriority('');
    setOppNotes('');
    setCallbackDate('');
    setCallbackTime('09:00');
    setCallbackNote('');
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
            const mapped: Person[] = raw.map((r: any) => ({
              person_id: r.person_id ?? r.id,
              first_name: r.first_name ?? null,
              last_name: r.last_name ?? null,
              occupation: r.occupation ?? null,
              employer: r.employer ?? null,
              phone: r.phone ?? null,
              phone_cell: r.phone_cell ?? null,
              phone_landline: r.phone_landline ?? null,
              email: r.email ?? null,
              address: r.address ?? null,
              notes: r.notes ?? null,
            }));

            // Attach walklist_item_id mapping for this list
            const joinMapRes = await supabase
              .from('walklist_items')
              .select('id, person_id, company_id')
              .eq('walklist_id', effectiveWalklistId);
            if (joinMapRes.error) throw joinMapRes.error;

            const wlItemByPerson = new Map<string, string>(
              (joinMapRes.data ?? []).map((j) => [j.person_id, j.id])
            );
            const mappedWithJoin: Person[] = mapped.map((r) => ({
              ...r,
              walklist_item_id: wlItemByPerson.get(r.person_id as string) ?? null,
            }));

            // Enrich with phone_cell/phone_landline if RPC didn't return them
            const needsEnrich = mappedWithJoin.filter(p => p.phone_cell == null && p.phone_landline == null && p.person_id);
            if (needsEnrich.length) {
              const { data: enrichData } = await supabase
                .from('people')
                .select('id, phone_cell, phone_landline')
                .in('id', needsEnrich.map(p => p.person_id as string));
              const enrichMap = new Map((enrichData ?? []).map((r: any) => [r.id, r]));
              mappedWithJoin.forEach(p => {
                if (p.person_id && p.phone_cell == null && p.phone_landline == null) {
                  const e = enrichMap.get(p.person_id);
                  if (e) { p.phone_cell = e.phone_cell ?? null; p.phone_landline = e.phone_landline ?? null; }
                }
              });
            }

            if (!cancelled) {
              setPeople(mappedWithJoin);
              const clamped = Math.max(0, Math.min(idx, Math.max(0, mappedWithJoin.length - 1)));
              if (clamped !== idx) setIdx(clamped);
            }
            return;
          }
        }

        // 2) Fallback: tables ordered by order_index (handles people and companies)
        const join = await supabase
          .from("walklist_items")
          .select("id, person_id, company_id, order_index")
          .eq("walklist_id", effectiveWalklistId)
          .order("order_index", { ascending: true, nullsFirst: true });

        if (join.error) throw join.error;

        const personItemIds = (join.data ?? []).filter(j => j.person_id).map(j => j.person_id) as string[];
        const companyItemIds = (join.data ?? []).filter(j => j.company_id && !j.person_id).map(j => j.company_id) as string[];

        if (personItemIds.length === 0 && companyItemIds.length === 0) { if (!cancelled) setPeople([]); return; }

        const [pplData, coData] = await Promise.all([
          personItemIds.length
            ? supabase.from("people").select("id, first_name, last_name, occupation, phone, phone_cell, phone_landline, email, address").in("id", personItemIds)
            : { data: [] as any[], error: null },
          companyItemIds.length
            ? supabase.from("companies").select("id, name, phone, email").in("id", companyItemIds)
            : { data: [] as any[], error: null },
        ]);

        if (pplData.error) throw pplData.error;

        const byPersonId = new Map<string, any>((pplData.data ?? []).map(r => [r.id, r]));
        const byCompanyId = new Map<string, any>((coData.data ?? []).map(r => [r.id, r]));

        const ordered: Person[] = (join.data ?? [])
          .map(j => {
            if (j.person_id) {
              const r = byPersonId.get(j.person_id);
              return r ? ({
                person_id: r.id,
                walklist_item_id: j.id,
                first_name: r.first_name ?? null,
                last_name: r.last_name ?? null,
                occupation: r.occupation ?? null,
                employer: null,
                phone: r.phone ?? null,
                phone_cell: r.phone_cell ?? null,
                phone_landline: r.phone_landline ?? null,
                email: r.email ?? null,
                address: r.address ?? null,
              } as Person) : null;
            } else if (j.company_id) {
              const c = byCompanyId.get(j.company_id);
              return c ? ({
                person_id: null,
                company_id: c.id,
                walklist_item_id: j.id,
                company_name: c.name ?? null,
                phone: c.phone ?? null,
                phone_cell: null,
                phone_landline: null,
                email: c.email ?? null,
              } as Person) : null;
            }
            return null;
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

  // Fetch capture mode + dispositionConfig for this list (once)
  useEffect(() => {
    fetch(`/api/doors/${params.id}/survey`)
      .then((r) => r.json())
      .then((d) => {
        setCallCaptureMode(d.call_capture_mode ?? null);
        setSurveyId(d.survey_id ?? null);
        if (d.dispositionConfig) setDispoConfig(d.dispositionConfig);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Lazy-fetch rich profile when Profile tab is opened
  useEffect(() => {
    if (!showProfile || !people) return;
    const person = people[idx];
    if (!person || dialProfile) return;
    let cancelled = false;
    setDialProfileLoading(true);
    (async () => {
      try {
        // 1) Person detail
        const { data: pd } = await supabase
          .from('people')
          .select('phone, phone_cell, phone_landline, email, occupation_title, company_name, notes, household_id, mailing_address')
          .eq('id', person.person_id)
          .maybeSingle();

        // 2) Household name + address via household_id or person_households fallback
        let hhId: string | null = pd?.household_id ?? null;
        if (!hhId) {
          const { data: ph } = await supabase
            .from('person_households')
            .select('household_id')
            .eq('person_id', person.person_id)
            .limit(1)
            .maybeSingle();
          hhId = ph?.household_id ?? null;
        }

        let household_name: string | null = null;
        let address: string | null = null;
        if (hhId) {
          const { data: hh } = await supabase
            .from('households')
            .select('name, location_id')
            .eq('id', hhId)
            .maybeSingle();
          household_name = hh?.name ?? null;
          if (hh?.location_id) {
            const { data: loc } = await supabase
              .from('locations')
              .select('normalized_key, address_line1, city, state, postal_code')
              .eq('id', hh.location_id)
              .maybeSingle();
            if (loc) {
              address = loc.normalized_key ||
                [loc.address_line1, loc.city, loc.state, loc.postal_code].filter(Boolean).join(', ');
            }
          }
        }

        if (!cancelled) setDialProfile({ ...pd, household_name, address });
      } catch {
        if (!cancelled) setDialProfile({});
      } finally {
        if (!cancelled) setDialProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfile, idx]);

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

  const fullName = p.company_name
    ? p.company_name
    : `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown';
  const onStartInteraction = () => { if (!startedAt) setStartedAt(Date.now()); };
  const dispoItems = dispoConfig.calls.filter((d) => d.enabled);
  const colorMap = buildColorMap(dispoConfig);
  const resultColor = result ? colorMap[result] : undefined;

  async function saveAndNext() {
    if (!p) return;
    try {
      const effectiveWalklistId = await resolveEffectiveWalklistId(params.id);

      // 🔒 Use ONE forced tenant value for all writes
      const tenantId = FORCED_TENANT_ID;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? '00000000-0000-0000-0000-000000000000';
      const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

      // 1) Update person (skip for company items)
      if (p.person_id) {
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
      }

      // 2) Create stop — include forced tenant and effective ids
      const { data: stopData, error: stopErr } = await supabase.rpc('gs_create_stop_v1', {
        _tenant_id: tenantId,
        _payload: {
          tenant_id: tenantId,
          walklist_id: effectiveWalklistId,
          walklist_item_id: p.walklist_item_id ?? null,
          person_id: p.person_id ?? null,
          user_id: userId,
          channel: 'call',
          result,
          notes: notes || (p.company_name ? `Company: ${p.company_name}` : ''),
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

      // Auto-create callback reminder if date was provided
      if (result === 'call_back' && callbackDate) {
        try {
          const due = new Date(`${callbackDate}T${callbackTime || '09:00'}:00`).toISOString();
          await fetch('/api/crm/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'callback',
              title: `Call Back: ${fullName}`,
              notes: callbackNote.trim() || null,
              due_at: due,
              person_id: p.person_id,
              walklist_item_id: p.walklist_item_id ?? null,
              stop_id: stopId,
            }),
          });
        } catch {
          // Non-fatal — stop was already saved
        }
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
        {/* Person header — always visible */}
        <h4 style={{ marginBottom: 2 }}>{fullName}</h4>
        <p className="muted" style={{ marginBottom: 6 }}>
          {p.occupation || '—'}{p.employer ? ` • ${p.employer}` : ''}
        </p>

        <div className="row" style={{ marginBottom: 12 }}>
          {/* Show cell (C) and landline (L) separately if both exist; otherwise fall back to phone */}
          {(p.phone_cell || p.phone_landline) ? (
            <>
              {p.phone_cell && (
                <a className="press-card" style={{ gridTemplateColumns: '1fr' }}
                  href={`tel:${encodeURIComponent(p.phone_cell)}`} onClick={onStartInteraction}>
                  📱 C: {p.phone_cell}
                </a>
              )}
              {p.phone_landline && (
                <a className="press-card" style={{ gridTemplateColumns: '1fr' }}
                  href={`tel:${encodeURIComponent(p.phone_landline)}`} onClick={onStartInteraction}>
                  ☎️ L: {p.phone_landline}
                </a>
              )}
            </>
          ) : p.phone ? (
            <a className="press-card" style={{ gridTemplateColumns: '1fr' }}
              href={`tel:${encodeURIComponent(p.phone)}`} onClick={onStartInteraction}>
              Call
            </a>
          ) : null}
          {p.email && (
            <a className="press-card" style={{ gridTemplateColumns: '1fr' }}
              href={`mailto:${encodeURIComponent(p.email)}`} onClick={onStartInteraction}>
              Email
            </a>
          )}
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,.08)', paddingBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowProfile(false)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: !showProfile ? 'rgba(96,165,250,.18)' : 'transparent',
              color: !showProfile ? '#60A5FA' : 'rgba(255,255,255,.5)',
              fontWeight: !showProfile ? 700 : 400, fontSize: 13,
            }}
          >
            📋 Form
          </button>
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: showProfile ? 'rgba(96,165,250,.18)' : 'transparent',
              color: showProfile ? '#60A5FA' : 'rgba(255,255,255,.5)',
              fontWeight: showProfile ? 700 : 400, fontSize: 13,
            }}
          >
            👤 Profile
          </button>
        </div>

        {/* Profile tab */}
        {showProfile && (
          <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
            {dialProfileLoading && <p className="muted">Loading…</p>}
            {!dialProfileLoading && dialProfile && (() => {
              const d = dialProfile;
              const phones = [d.phone, d.phone_cell, d.phone_landline].filter(Boolean);
              const hasAny = d.address || d.mailing_address || d.household_name ||
                phones.length || d.email || d.occupation_title || d.company_name || d.notes;
              const row = (label: string, val: string) => (
                <div key={label}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                  <div style={{ lineHeight: 1.5 }}>{val}</div>
                </div>
              );
              return (
                <>
                  {!hasAny && <p className="muted">No additional details on file.</p>}
                  {d.household_name && row('Household', d.household_name)}
                  {(d.address || d.mailing_address) && row('Address', (d.address || d.mailing_address)!)}
                  {(d.occupation_title || d.company_name) && row('Role', [d.occupation_title, d.company_name].filter(Boolean).join(' · '))}
                  {phones.length > 0 && row('Phone', phones.join(' / '))}
                  {d.email && row('Email', d.email)}
                  {d.notes && (
                    <div>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Notes</div>
                      <div style={{ lineHeight: 1.6, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{d.notes}</div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Form tab */}
        {!showProfile && (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
          <label htmlFor="callResult" className="muted">Call result</label>
          {resultColor && (
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: resultColor, display: 'inline-block', flexShrink: 0,
            }} />
          )}
        </div>
        <select
          id="callResult"
          className="gg-field gg-select"
          value={result}
          onChange={(e) => {
            if (!startedAt) setStartedAt(Date.now());
            const v = e.target.value;
            setResult(v);
            if (callCaptureMode === 'survey' && surveyId && v === 'connected') {
              setShowSurvey(true);
              setSurveyDone(false);
            } else {
              setShowSurvey(false);
            }
          }}
          style={resultColor ? { borderLeft: `4px solid ${resultColor}` } : undefined}
        >
          <option value="" disabled>Select…</option>
          {dispoItems.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>

        {/* Inline survey — shown when connected and a survey is linked */}
        {callCaptureMode === 'survey' && showSurvey && !surveyDone && surveyId && (
          <KnockSurvey
            surveyId={surveyId}
            contactId={p.person_id}
            onDone={() => { setShowSurvey(false); setSurveyDone(true); }}
          />
        )}

        {/* Inline callback scheduling — shown when call_back is selected */}
        {result === 'call_back' && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(96,165,250,.25)', background: 'rgba(96,165,250,.06)' }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Schedule Call Back
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="cbDate" className="muted">Date</label>
                <input
                  id="cbDate"
                  type="date"
                  className="gg-field"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="cbTime" className="muted">Time</label>
                <input
                  id="cbTime"
                  type="time"
                  className="gg-field"
                  value={callbackTime}
                  onChange={(e) => setCallbackTime(e.target.value)}
                />
              </div>
            </div>
            <label htmlFor="cbNote" className="muted">Note (optional)</label>
            <input
              id="cbNote"
              className="gg-field"
              value={callbackNote}
              onChange={(e) => setCallbackNote(e.target.value)}
              placeholder="Best time to call, callback reason…"
            />
          </div>
        )}

        <label htmlFor="callNotes" className="muted" style={{ marginTop: 12 }}>Notes</label>
        <textarea
          id="callNotes"
          rows={3}
          className="gg-field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes for this call…"
        />

        {/* Opportunity form — shown automatically when callCaptureMode=opportunity, or via checkbox otherwise */}
        {callCaptureMode !== 'opportunity' && (
          <label className="row" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={mkOpp}
              onChange={(e) => setMkOpp(e.target.checked)}
            />
            <span className="muted">Create opportunity linked to this call</span>
          </label>
        )}

        {(callCaptureMode === 'opportunity' || mkOpp) && (
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

        </>)}

        {/* Actions — always visible in both tabs */}
        <div className="row" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.08)' }}>
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
            disabled={!result || (callCaptureMode === 'survey' && result === 'connected' && !!surveyId && !surveyDone)}
            title={!result ? 'Select a call result first' : ''}
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
