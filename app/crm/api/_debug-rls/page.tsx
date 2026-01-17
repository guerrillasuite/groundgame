// app/crm/_debug-rls/page.tsx
export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';

export default async function DebugRLSPage() {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '(none)';
  const sb = getSupabaseServer();

  // 1) Auth status
  const { data: userRes, error: userErr } = await sb.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  // 2) DB context (requires the SQL once to create `app.debug_tenant_context`)
  let dbg: any = null, dbgErr: any = null;
  try {
    const { data, error } = await sb.rpc('debug_tenant_context');
    dbg = data; dbgErr = error?.message ?? null;
  } catch (e: any) {
    dbgErr = e?.message ?? String(e);
  }

  // 3) RLS counts
  const { count: people,      error: pErr } = await sb.from('people').select('id', { head: true, count: 'exact' });
  const { count: households,  error: hErr } = await sb.from('households').select('id', { head: true, count: 'exact' });
  const { count: locations,   error: lErr } = await sb.from('locations').select('id', { head: true, count: 'exact' });
  const { count: companies,   error: cErr } = await sb.from('companies').select('id', { head: true, count: 'exact' });

  return (
    <pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>
      {JSON.stringify({
        host,
        userId,
        userErr: userErr?.message ?? null,
        dbg, dbgErr,
        counts: { people: people ?? 0, households: households ?? 0, locations: locations ?? 0, companies: companies ?? 0 },
        errors: { people: pErr?.message ?? null, households: hErr?.message ?? null, locations: lErr?.message ?? null, companies: cErr?.message ?? null }
      }, null, 2)}
    </pre>
  );
}
