'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase/client";
import Link from 'next/link';

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

function AppAuthPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get('next') ?? '/';

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
    router.replace('/account/auth');
  }

  return (
    <section style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Account</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 12 }}>
        <Link href="/account/settings" style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: 'rgba(255,255,255,.07)', color: '#fff' }}>
          Settings
        </Link>
        <span style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--gg-primary, #2563eb)', color: 'var(--on-primary, #fff)' }}>
          Login / Logout
        </span>
      </div>

      {session ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.6 }}>Signed in as</p>
            <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{session.user.email}</p>
          </div>
          <button
            onClick={logout}
            style={{ padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.07)', color: 'inherit', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Method toggle */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['password', 'magic', 'forgot'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); reset(); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === m ? 'var(--gg-primary, #2563eb)' : 'rgba(255,255,255,.07)', color: mode === m ? 'var(--on-primary, #fff)' : '#fff' }}
              >
                {m === 'password' ? 'Password' : m === 'magic' ? 'Magic Link' : 'Set Password'}
              </button>
            ))}
          </div>

          {mode === 'password' && (
            <form onSubmit={loginWithPassword} style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Email</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={INPUT} />
              </div>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Password</label>
                <PasswordInput value={password} onChange={setPassword} placeholder="Your password" />
              </div>
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
              <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--gg-primary, #2563eb)', color: 'var(--on-primary, #fff)', fontWeight: 600, fontSize: 14, cursor: loading ? 'default' : 'pointer' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <p style={{ fontSize: 12, opacity: 0.5, margin: 0, textAlign: 'center' }}>
                No password?{' '}
                <button type="button" onClick={() => { setMode('magic'); reset(); }} style={{ background: 'none', border: 'none', color: 'var(--gg-primary, #2563eb)', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                  Use a magic link
                </button>
              </p>
            </form>
          )}

          {mode === 'magic' && (
            <form onSubmit={loginWithMagicLink} style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Email</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={INPUT} />
              </div>
              {msg && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>{msg}</p>}
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
              <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--gg-primary, #2563eb)', color: 'var(--on-primary, #fff)', fontWeight: 600, fontSize: 14, cursor: loading ? 'default' : 'pointer' }}>
                {loading ? 'Sending…' : 'Send Magic Link'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={sendPasswordReset} style={{ display: 'grid', gap: 10 }}>
              <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>Enter your email and we'll send a link to create or update your password.</p>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Email</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={INPUT} />
              </div>
              {msg && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>{msg}</p>}
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
              <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--gg-primary, #2563eb)', color: 'var(--on-primary, #fff)', fontWeight: 600, fontSize: 14, cursor: loading ? 'default' : 'pointer' }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

export default function AppAuthPage() {
  return (
    <Suspense>
      <AppAuthPageInner />
    </Suspense>
  );
}
