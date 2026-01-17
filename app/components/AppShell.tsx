'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/app', label: 'Home' },
  { href: '/app/walklists', label: 'Walklists' },
  { href: '/app/dialer', label: 'Dialer' },
  { href: '/app/settings', label: 'Settings' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
        <div className="mx-auto max-w-screen-md px-4 py-3">
          <div className="text-lg font-semibold">GroundGame</div>
          <div className="text-xs text-gray-500">Fast field workflows â€¢ one tap at a time</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-md flex-1 px-4 py-4">
        {children}
      </main>

      <nav className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t">
        <ul className="mx-auto max-w-screen-md grid grid-cols-4 text-sm">
          {tabs.map(t => {
            const active = pathname === t.href || pathname.startsWith(t.href + '/');
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`block text-center py-3 ${active ? 'font-semibold' : 'text-gray-600'}`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

