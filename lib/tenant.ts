// lib/tenant.ts (server-only)

import { headers } from 'next/headers';

export type Tenant = { id: string; slug: string };
export type Branding = {
  appName: string; logoUrl: string;
  primaryColor: string; accentColor: string;
  bgColor: string; surfaceColor: string;
  textColor: string; mutedTextColor: string;
};

// Next 15 requires await on dynamic APIs like headers()
async function getHost(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-host') ?? h.get('host') ?? '';
}

function mapSlugToTenantId(slug: string): string | null {
  switch (slug) {
    case 'test':
      return '00000000-0000-0000-0000-000000000000';
    case 'guerrillasuite':
      return '85c60ca4-ee15-4d45-b27e-a8758d91f896';
    case 'localhost':     return '00000000-0000-0000-0000-000000000000';
    // TODO: add thunder, riseandfite, etc. as you onboard them
    default:
      return null; // unknown tenant → let RLS deny
  }
}

export async function getTenant(): Promise<Tenant> {
  const host = await getHost();
  const slug = (host.split('.')[0] || 'default').toLowerCase();
  const id = mapSlugToTenantId(slug) ?? '00000000-0000-0000-0000-000000000000'; // dev-safe default to Test
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
