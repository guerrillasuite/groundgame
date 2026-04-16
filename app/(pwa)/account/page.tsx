'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

export default function AccountIndexPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? null);
      setRole(user?.app_metadata?.role ?? null);
    });
  }, []);

  const links = [
    { href: '/account/settings', label: 'Settings' },
    { href: '/account/auth', label: 'Login / Logout' },
  ];

  return (
    <section style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Account</h1>

      {/* Account info */}
      {email && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', marginBottom: 16 }}>
          <p style={{ margin: '0 0 2px', fontSize: 12, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed in as</p>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{email}</p>
          {role && (
            <span style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: role === 'director' ? 'rgba(124,58,237,.35)' : role === 'support' ? 'rgba(37,99,235,.25)' : 'rgba(255,255,255,.08)', color: role === 'director' ? '#c4b5fd' : role === 'support' ? '#93c5fd' : '#ccc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {role === 'director' ? 'Director' : role === 'support' ? 'Support' : role === 'operative' ? 'Operative' : role}
            </span>
          )}
        </div>
      )}

      {/* Nav links */}
      <div style={{ display: 'grid', gap: 8 }}>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', textDecoration: 'none', color: 'inherit', fontSize: 15, fontWeight: 600 }}
          >
            {label}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4 }}>
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}
