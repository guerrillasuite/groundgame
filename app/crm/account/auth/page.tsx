'use client';

import { useEffect, useState } from 'react';
import { supabase } from "@/lib/supabase/client";
import Link from 'next/link';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [session, setSession] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tabs = [
    { href: '/crm/account', label: 'Account' },
    { href: '/crm/account/history', label: 'History' },
    { href: '/crm/account/settings', label: 'Settings' },
    { href: '/crm/account/auth', label: 'Login/Logout' },
  ];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  async function login() {
    setMsg(null); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/crm/account/auth` } });
    if (error) setErr(error.message);
    else setMsg('Check your email for a magic link.');
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Login / Logout</h2>
      <div className="tabs">
        {tabs.map(t => (
          <Link key={t.href} href={t.href} className={`tab${t.href === '/account/auth' ? ' active' : ''}`}>{t.label}</Link>
        ))}
      </div>

      {session ? (
        <>
          <div className="list-item">
            <h4>Signed in</h4>
            <p className="muted">{session.user.email}</p>
          </div>
          <button onClick={logout} className="press-card" style={{ gridTemplateColumns: '1fr' }}>Log out</button>
        </>
      ) : (
        <>
          <div className="list-item">
            <h4>Sign in</h4>
            <div className="row">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'var(--brand-text)' }}
              />
            </div>
          </div>
          <button onClick={login} className="press-card" style={{ gridTemplateColumns: '1fr' }}>Send magic link</button>
          {msg && <p>{msg}</p>}
          {err && <p className="muted">Error: {err}</p>}
        </>
      )}
    </div>
  );
}

