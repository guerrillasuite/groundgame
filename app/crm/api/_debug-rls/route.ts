import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server'; // your existing helper

export async function GET() {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const sb = getSupabaseServer();

  // 1) Are we authenticated?
  const { data: userRes, error: userErr } = await sb.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  // 2) What does the DB see (tenant header, membership, counts)?
  //    (Run the SQL from section B once to create this RPC if you haven't yet.)
  let dbg:any = null, dbgErr:any = null;
  try {
    const { data, error } = await sb.rpc('debug_tenant_context');
    dbg = data; dbgErr = error?.message ?? null;
  } catch (e:any) {
    dbgErr = e?.message ?? String(e);
  }

  // 3) What does RLS actually return right now?
  const { count: peopleCount,  error: pErr } = await sb.from('people').select('id', { head: true, count: 'exact' });
  const { count: hhCount,      error: hErr } = await sb.from('households').select('id', { head: true, count: 'exact' });
  const { count: locCount,     error: lErr } = await sb.from('locations').select('id', { head: true, count: 'exact' });
  const { count: coCount,      error: cErr } = await sb.from('companies').select('id', { head: true, count: 'exact' });

  return NextResponse.json({
    host,
    userId,
    userErr: userErr?.message ?? null,
    dbg, dbgErr,
    counts: {
      people:      peopleCount ?? 0,
      households:  hhCount     ?? 0,
      locations:   locCount    ?? 0,
      companies:   coCount     ?? 0,
    },
    errors: {
      people: pErr?.message ?? null,
      households: hErr?.message ?? null,
      locations: lErr?.message ?? null,
      companies: cErr?.message ?? null,
    }
  });
}
