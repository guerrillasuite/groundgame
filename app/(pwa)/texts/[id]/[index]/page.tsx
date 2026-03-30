// app/(pwa)/texts/[id]/[index]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase/client";
import { buildColorMap, DEFAULT_DISPO_CONFIG, type DispositionConfig } from "@/lib/dispositionConfig";

type Person = {
  person_id: string | null;
  company_id?: string | null;
  walklist_item_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  phone_cell?: string | null;
  email?: string | null;
};

type LastStop = {
  result: string;
  created_at: string;
};

const FORCED_TENANT_ID =
  process.env.NEXT_PUBLIC_TEST_TENANT_ID ?? "00000000-0000-0000-0000-000000000000";

async function getTenantIdFromServer(): Promise<string | null> {
  try {
    const res = await fetch("/api/tenant-id", { cache: "no-store" });
    const body = await res.json();
    return (body?.tenant_id as string) ?? null;
  } catch {
    return null;
  }
}

async function resolveEffectiveWalklistId(id: string): Promise<string> {
  const quick = await supabase
    .from('walklist_items')
    .select('id', { head: true, count: 'exact' })
    .eq('walklist_id', id);
  if (!quick.error && (quick.count ?? 0) > 0) return id;
  return id;
}

export default function TextScreen({ params }: { params: { id: string; index: string } }) {
  const router = useRouter();
  const idxFromUrl = Number(params.index);

  const [idx, setIdx] = useState<number>(
    Number.isFinite(idxFromUrl) && idxFromUrl >= 0 ? idxFromUrl : 0
  );
  const [people, setPeople] = useState<Person[] | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dispoConfig, setDispoConfig] = useState<DispositionConfig>(DEFAULT_DISPO_CONFIG);
  const [lastStop, setLastStop] = useState<LastStop | null>(null);

  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset form state on person change
  useEffect(() => {
    setResult('');
    setNotes('');
    setCopied(false);
    setLastStop(null);
  }, [idx]);

  // Load people list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        setPeople(null);
        const tenantId = await getTenantIdFromServer();
        const effectiveId = await resolveEffectiveWalklistId(params.id);

        // Try RPC first
        const rpc = await supabase.rpc("gs_get_walklist_people_v1", {
          _tenant_id: tenantId,
          _walklist_id: effectiveId,
        });

        if (!rpc.error) {
          const raw = Array.isArray(rpc.data) ? rpc.data : (rpc.data as any)?.people ?? [];
          if (raw?.length) {
            const joinMapRes = await supabase
              .from('walklist_items')
              .select('id, person_id, company_id')
              .eq('walklist_id', effectiveId)
              .order('order_index', { ascending: true });

            const wlItemByPerson = new Map<string, string>(
              (joinMapRes.data ?? []).map((j) => [j.person_id, j.id])
            );

            const baseMap: Person[] = raw.map((r: any) => ({
              person_id: r.person_id ?? r.id,
              walklist_item_id: wlItemByPerson.get(r.person_id ?? r.id) ?? null,
              first_name: r.first_name ?? null,
              last_name: r.last_name ?? null,
              phone: r.phone ?? null,
              phone_cell: r.phone_cell ?? null,
              email: r.email ?? null,
            }));

            // Enrich with phone_cell if RPC didn't return it
            const needsEnrich = baseMap.filter(p => p.phone_cell == null && p.person_id);
            if (needsEnrich.length) {
              const { data: enrichData } = await supabase
                .from('people')
                .select('id, phone_cell')
                .in('id', needsEnrich.map(p => p.person_id as string));
              const enrichMap = new Map((enrichData ?? []).map((r: any) => [r.id, r.phone_cell]));
              baseMap.forEach(p => { if (p.person_id && p.phone_cell == null) p.phone_cell = enrichMap.get(p.person_id) ?? null; });
            }

            if (!cancelled) {
              setPeople(baseMap);
              const clamped = Math.max(0, Math.min(idx, Math.max(0, baseMap.length - 1)));
              if (clamped !== idx) setIdx(clamped);
            }
            return;
          }
        }

        // Fallback: tables ordered by order_index (handles both people and companies)
        const join = await supabase
          .from("walklist_items")
          .select("id, person_id, company_id, order_index")
          .eq("walklist_id", effectiveId)
          .order("order_index", { ascending: true });

        if (join.error) throw join.error;

        const personItemIds = (join.data ?? []).filter(j => j.person_id).map(j => j.person_id) as string[];
        const companyItemIds = (join.data ?? []).filter(j => j.company_id && !j.person_id).map(j => j.company_id) as string[];

        const [pplData, coData] = await Promise.all([
          personItemIds.length
            ? supabase.from("people").select("id, first_name, last_name, phone, phone_cell, email").in("id", personItemIds)
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
                phone: r.phone ?? null,
                phone_cell: r.phone_cell ?? null,
                email: r.email ?? null,
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
        if (!cancelled) { setErr(e?.message || "Failed to load"); setPeople([]); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Fetch walklist description (script) and disposition config
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("walklists")
        .select("description")
        .eq("id", params.id)
        .maybeSingle();
      if (data?.description) setScript(data.description);
    })();

    fetch(`/api/doors/${params.id}/survey`)
      .then(r => r.json())
      .then(d => { if (d.dispositionConfig) setDispoConfig(d.dispositionConfig); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Fetch last stop for current person on this list
  useEffect(() => {
    const p = people?.[idx];
    if (!p) return;
    let cancelled = false;
    (async () => {
      const effectiveId = await resolveEffectiveWalklistId(params.id);
      const { data } = await supabase
        .from("stops")
        .select("result, created_at")
        .eq("person_id", p.person_id)
        .eq("walklist_id", effectiveId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setLastStop({ result: data.result, created_at: data.created_at });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, idx, params.id]);

  const p = useMemo(() => (people && people[idx]) || null, [people, idx]);

  async function saveAndNext() {
    if (!p || !result) return;
    setSaving(true);
    try {
      const effectiveId = await resolveEffectiveWalklistId(params.id);
      const tenantId = FORCED_TENANT_ID;
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? '00000000-0000-0000-0000-000000000000';

      const { error: stopErr } = await supabase.rpc('gs_create_stop_v1', {
        _tenant_id: tenantId,
        _payload: {
          tenant_id: tenantId,
          walklist_id: effectiveId,
          walklist_item_id: p.walklist_item_id ?? null,
          person_id: p.person_id ?? null,
          user_id: userId,
          channel: 'text',
          result,
          notes: notes.trim() || (p.company_name ? `Company: ${p.company_name}` : null),
          duration_sec: null,
        },
      });
      if (stopErr) throw stopErr;

      router.replace(`/texts/${params.id}/${idx + 1}`);
      setIdx(idx + 1);
    } catch (e: any) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function fmtLastStop(stop: LastStop): string {
    const colorMap = buildColorMap(dispoConfig);
    const label = dispoConfig.texts.find(d => d.key === stop.result)?.label ?? stop.result;
    const dt = new Date(stop.created_at);
    const dateStr = isNaN(+dt) ? "" : ` · ${dt.toLocaleDateString()}`;
    return `Last: ${label}${dateStr}`;
  }

  function copyScript() {
    if (!script) return;
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (err) return <p className="muted" style={{ padding: 16 }}>Error: {err}</p>;
  if (!people) return <p className="muted" style={{ padding: 16 }}>Loading…</p>;

  if (!p) {
    return (
      <div className="stack">
        <div className="list-item">
          <h4>Done with this list!</h4>
          <p className="muted">You worked through all contacts.</p>
        </div>
        <Link href={`/texts/${params.id}`} className="press-card" style={{ gridTemplateColumns: '1fr' }}>
          ‹ Back to list
        </Link>
      </div>
    );
  }

  const fullName = p.company_name
    ? p.company_name
    : `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown';
  const firstName = p.company_name ?? p.first_name?.trim() ?? fullName;
  const displayPhone = p.phone_cell ?? p.phone ?? null;
  const dispoItems = dispoConfig.texts.filter(d => d.enabled);
  const colorMap = buildColorMap(dispoConfig);
  const resultColor = result ? colorMap[result] : undefined;

  const smsHref = displayPhone
    ? `sms:${encodeURIComponent(displayPhone)}${script ? `?body=${encodeURIComponent(script)}` : ''}`
    : null;

  return (
    <div className="stack" style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href={`/texts/${params.id}`} style={{ fontSize: 14, opacity: 0.7, textDecoration: "none" }}>
          ‹ List
        </Link>
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          {idx + 1} of {people.length}
        </span>
      </div>

      {/* Person card */}
      <div className="list-item" style={{ gap: 2 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{fullName}</h3>
        {displayPhone && (
          <p style={{ margin: "4px 0 0", fontSize: 15, color: "var(--gg-text-dim, #6b7280)" }}>
            {displayPhone}{p.phone_cell && p.phone && p.phone_cell !== p.phone ? ' (Cell)' : ''}
          </p>
        )}
        {p.email && (
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--gg-text-dim, #9ca3af)" }}>
            {p.email}
          </p>
        )}
      </div>

      {/* Script card */}
      {script && (
        <div style={{
          background: "var(--gg-card, white)",
          border: "1px solid var(--gg-border, #e5e7eb)",
          borderRadius: 10,
          padding: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)" }}>
              Script
            </span>
            <button
              onClick={copyScript}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--gg-border, #e5e7eb)",
                background: copied ? "#22c55e" : "transparent",
                color: copied ? "#fff" : "inherit",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {script}
          </p>
        </div>
      )}

      {/* Text button */}
      {smsHref ? (
        <a
          href={smsHref}
          style={{
            display: "block",
            textAlign: "center",
            padding: "14px 20px",
            borderRadius: 10,
            background: "var(--gg-primary, #2563eb)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
          }}
        >
          💬 Text {firstName}
        </a>
      ) : (
        <div style={{ padding: 12, borderRadius: 10, background: "rgba(239,68,68,0.1)", color: "#dc2626", fontSize: 14, textAlign: "center" }}>
          No phone number on file
        </div>
      )}

      {/* Last stop badge */}
      {lastStop && (
        <div style={{
          fontSize: 13,
          padding: "6px 12px",
          borderRadius: 6,
          background: "var(--gg-bg, #f9fafb)",
          border: "1px solid var(--gg-border, #e5e7eb)",
          color: colorMap[lastStop.result] ?? "var(--gg-text-dim, #6b7280)",
        }}>
          {fmtLastStop(lastStop)}
        </div>
      )}

      {/* Log result */}
      <div style={{
        background: "var(--gg-card, white)",
        border: "1px solid var(--gg-border, #e5e7eb)",
        borderRadius: 10,
        padding: 14,
        display: "grid",
        gap: 10,
      }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 6 }}>
            Result
          </label>
          <select
            value={result}
            onChange={e => setResult(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 7,
              border: `2px solid ${resultColor ?? "var(--gg-border, #e5e7eb)"}`,
              background: "var(--gg-input, white)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value="">— Select result —</option>
            {dispoItems.map(d => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)", marginBottom: 6 }}>
            Notes <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes about this contact…"
            rows={2}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 7,
              border: "1px solid var(--gg-border, #e5e7eb)",
              background: "var(--gg-input, white)",
              fontSize: 14,
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => { router.replace(`/texts/${params.id}/${idx + 1}`); setIdx(idx + 1); }}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 9,
            border: "1px solid var(--gg-border, #e5e7eb)",
            background: "transparent",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Skip
        </button>
        <button
          onClick={saveAndNext}
          disabled={saving || !result}
          style={{
            flex: 2,
            padding: "12px",
            borderRadius: 9,
            border: "none",
            background: saving || !result ? "var(--gg-border, #e5e7eb)" : "var(--gg-primary, #2563eb)",
            color: saving || !result ? "var(--gg-text-dim, #9ca3af)" : "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: saving || !result ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save & Next"}
        </button>
      </div>
    </div>
  );
}
