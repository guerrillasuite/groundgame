// app/_debug-rls/page.tsx
export const dynamic = 'force-dynamic'; // no caching

import { headers } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';

export default async function DebugRLSPage() {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '(none)';
  const sb = getSupabaseServer();

  // 1) Auth status
  const { data: userRes, error: userErr } = await sb.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  // 2) DB-side context (uses the RPC we created earlier)
  let dbg: any = null, dbgErr: any = null;
  try {
    const { data, error } = await sb.rpc('debug_tenant_context');
    dbg = data; dbgErr = error?.message ?? null;
  } catch (e: any) {
    dbgErr = e?.message ?? String(e);
  }

  // 3) What RLS actually returns (counts only)
  const { count: peopleCount,     error: pErr } = await sb.from('people').select('id', { head: true, count: 'exact' });
  const { count: householdsCount, error: hErr } = await sb.from('households').select('id', { head: true, count: 'exact' });
  const { count: locationsCount,  error: lErr } = await sb.from('locations').select('id', { head: true, count: 'exact' });
  const { count: companiesCount,  error: cErr } = await sb.from('companies').select('id', { head: true, count: 'exact' });

  const payload = {
    host,
    userId,
    userErr: userErr?.message ?? null,
    dbg, dbgErr,
    counts: {
      people: peopleCount ?? 0,
      households: householdsCount ?? 0,
      locations: locationsCount ?? 0,
      companies: companiesCount ?? 0,
    },
    errors: {
      people: pErr?.message ?? null,
      households: hErr?.message ?? null,
      locations: lErr?.message ?? null,
      companies: cErr?.message ?? null,
    }
  };

  return (
    <pre style={{padding: 16, overflow: 'auto', whiteSpace: 'pre-wrap'}}>
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
