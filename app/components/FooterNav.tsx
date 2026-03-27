'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type FeatureKey, hasFeature } from '@/lib/features';

function Icon({ name }: { name: 'home'|'dial'|'door'|'user' }) {
  const common = { width: 22, height: 22, role: 'img', 'aria-hidden': true } as any;
  switch (name) {
    case 'home': return (<svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>);
    case 'dial': return (<svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h5v6H6zM13 2h5v10h-5zM6 10h5v12H6zM13 14h5v8h-5z"/></svg>);
    case 'door': return (<svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M6 3h10a1 1 0 0 1 1 1v16h2v2H5V4a1 1 0 0 1 1-1zm9 2H7v15h8zM9 12h2v2H9z"/></svg>);
    case 'user': return (<svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0-5-5a5 5 0 0 0 5 5zm0 2c-4.418 0-8 2.239-8 5v3h16v-3c0-2.761-3.582-5-8-5z"/></svg>);
  }
}

interface FooterNavProps {
  features: readonly FeatureKey[];
}

export function FooterNav({ features }: FooterNavProps) {
  const pathname = usePathname();

  const allItems = [
    { href: '/',        label: 'Home',    icon: 'home' as const, featureKey: null as FeatureKey | null },
    { href: '/dials',   label: 'Dials',   icon: 'dial' as const, featureKey: 'pwa_dials' as FeatureKey },
    { href: '/doors',   label: 'Doors',   icon: 'door' as const, featureKey: 'pwa_doors' as FeatureKey },
    { href: '/account', label: 'Account', icon: 'user' as const, featureKey: null as FeatureKey | null },
  ];

  const items = allItems.filter(
    (it) => it.featureKey === null || hasFeature(features, it.featureKey)
  );

  return (
    <nav className="footer-nav" aria-label="Primary">
      {items.map((it) => {
        const active = it.href === '/'
          ? pathname === '/'
          : pathname === it.href || pathname.startsWith(it.href + '/');
        return (
          <Link key={it.href} href={it.href} className={`footer-btn ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon name={it.icon} />
            <span style={{ fontSize: 12 }}>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
