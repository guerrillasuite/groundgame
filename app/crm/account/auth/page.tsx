'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase/client";
import Link from 'next/link';

const tabs = [
  { href: '/crm/account', label: 'Account' },
  { href: '/crm/account/history', label: 'History' },
  { href: '/crm/account/settings', label: 'Settings' },
  { href: '/crm/account/auth', label: 'Login/Logout' },
];

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  paddingRight: 40,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--brand-text, #fff)',
  fontSize: 14,
  boxSizing: 'border-box',
};

function PasswordInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState('CapsLock'));
  }
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          required type={show ? 'text' : 'password'} value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey} onKeyUp={handleKey}
          placeholder={placeholder} style={INPUT}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(255,255,255,.4)', lineHeight: 1 }}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
      {capsLock && <p style={{ color: '#fbbf24', fontSize: 12, margin: '4px 0 0' }}>Caps Lock is on</p>}
    </div>
  );
}

function AuthPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get('next') ?? '/crm';

  const [session, setSession] = useState<any>(null);
  const [mode, setMode] = useState<'password' | 'magic' | 'forgot'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      // Only redirect on a fresh login, not on the initial session restore
      if (event === 'SIGNED_IN' && sess) router.replace(next);
    });
    return () => { listener.subscription.unsubscribe(); };
  }, [next, router]);

  function reset() { setMsg(null); setErr(null); }

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); reset();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setLoading(false);
  }

  async function loginWithMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); reset();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setErr(error.message);
    else setMsg('Magic link sent — check your email.');
    setLoading(false);
  }

  async function sendPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); reset();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/account/set-password`,
    });
    if (error) setErr(error.message);
    else setMsg('Password reset email sent — check your inbox.');
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Login / Logout</h2>
      <div className="tabs">
        {tabs.map(t => (
          <Link key={t.href} href={t.href} className={`tab${t.href === '/crm/account/auth' ? ' active' : ''}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {session ? (
        <>
          <div className="list-item">
            <h4>Signed in</h4>
            <p className="muted">{session.user.email}</p>
          </div>
          <button onClick={logout} className="press-card" style={{ gridTemplateColumns: '1fr' }}>
            Log out
          </button>
        </>
      ) : (
        <>
          {/* Method toggle */}
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 12 }}>
            {(['password', 'magic', 'forgot'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); reset(); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === m ? 'var(--gg-primary, #2563eb)' : 'rgba(255,255,255,.07)', color: '#fff' }}
              >
                {m === 'password' ? 'Email + Password' : m === 'magic' ? 'Magic Link' : 'Set Password'}
              </button>
            ))}
          </div>

          {/* Password login */}
          {mode === 'password' && (
            <form onSubmit={loginWithPassword} style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Email</label>
                <input
                  required type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" style={INPUT}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Password</label>
                <PasswordInput value={password} onChange={setPassword} placeholder="Your password" />
              </div>
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>Error: {err}</p>}
              <button
                type="submit" disabled={loading}
                className="press-card" style={{ gridTemplateColumns: '1fr' }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <p style={{ fontSize: 12, opacity: 0.5, margin: 0, textAlign: 'center' }}>
                No password?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('magic'); reset(); }}
                  style={{ background: 'none', border: 'none', color: 'var(--gg-primary, #2563eb)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                >
                  Use a magic link instead
                </button>
              </p>
            </form>
          )}

          {/* Magic link login */}
          {mode === 'magic' && (
            <form onSubmit={loginWithMagicLink} style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Email</label>
                <input
                  required type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" style={INPUT}
                />
              </div>
              {msg && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>{msg}</p>}
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>Error: {err}</p>}
              <button
                type="submit" disabled={loading}
                className="press-card" style={{ gridTemplateColumns: '1fr' }}
              >
                {loading ? 'Sending…' : 'Send Magic Link'}
              </button>
            </form>
          )}

          {/* Forgot / reset password */}
          {mode === 'forgot' && (
            <form onSubmit={sendPasswordReset} style={{ display: 'grid', gap: 10 }}>
              <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>Enter your email and we'll send a link to create or update your password.</p>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Email</label>
                <input
                  required type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" style={INPUT}
                />
              </div>
              {msg && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>{msg}</p>}
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>Error: {err}</p>}
              <button
                type="submit" disabled={loading}
                className="press-card" style={{ gridTemplateColumns: '1fr' }}
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageInner />
    </Suspense>
  );
}
