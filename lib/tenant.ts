// lib/tenant.ts (server-only)

import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export type Tenant = { id: string; slug: string };
export type Branding = {
  appName: string; logoUrl: string;
  primaryColor: string; accentColor: string;
  bgColor: string; surfaceColor: string;
  textColor: string; mutedTextColor: string;
};

// Known tenants — fast path, no DB hit required
const HARDCODED_TENANTS: Record<string, string> = {
  'test':           '00000000-0000-0000-0000-000000000000',
  'localhost':      '00000000-0000-0000-0000-000000000000',
  'guerrillasuite': '85c60ca4-ee15-4d45-b27e-a8758d91f896',
};

// Next 15 requires await on dynamic APIs like headers()
async function getHost(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-host') ?? h.get('host') ?? '';
}

async function mapSlugToTenantId(slug: string): Promise<string | null> {
  // Fast path: known tenants require no DB round-trip
  if (HARDCODED_TENANTS[slug]) return HARDCODED_TENANTS[slug];

  // Dynamic lookup for tenants created via the admin UI
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await sb.from('tenants').select('id').eq('slug', slug).single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function getTenant(): Promise<Tenant> {
  const host = await getHost();
  const slug = (host.split('.')[0] || 'default').toLowerCase();
  const id = (await mapSlugToTenantId(slug)) ?? '00000000-0000-0000-0000-000000000000';
  return { id, slug };
}

export async function getTenantBranding(): Promise<Branding> {
  const { slug } = await getTenant();

  const base: Branding = {
    appName: 'GroundGame',
    logoUrl: '/icons/app-192.png',
    primaryColor: '#2563EB',
    accentColor: '#3B82F6',
    bgColor: '#0B0F17',
    surfaceColor: '#111827',
    textColor: '#F9FAFB',
    mutedTextColor: '#9CA3AF',
  };

  const perTenant: Partial<Record<string, Partial<Branding>>> = {
    thunder: { appName: 'GroundGame — Thunder' },
    guerrillasuite: { appName: 'Guerrilla Suite — GroundGame' },
  };

  return { ...base, ...(perTenant[slug] || {}) } as Branding;
}
