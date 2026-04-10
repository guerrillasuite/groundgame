'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
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
          required
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          onKeyUp={handleKey}
          placeholder={placeholder}
          style={INPUT}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
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
      {capsLock && (
        <p style={{ color: '#fbbf24', fontSize: 12, margin: '4px 0 0' }}>Caps Lock is on</p>
      )}
    </div>
  );
}

export default function PwaSettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [soLoading, setSoLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? null);
      setRole(user?.app_metadata?.role ?? null);
    });
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null); setPwErr(null);
    if (newPassword !== confirmPassword) {
      setPwErr('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPwErr('Password must be at least 8 characters.');
      return;
    }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setPwErr(error.message);
    else {
      setPwMsg('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
    }
    setPwLoading(false);
  }

  async function signOutEverywhere() {
    setSoLoading(true);
    await supabase.auth.signOut({ scope: 'global' });
    router.replace('/account/auth');
  }

  return (
    <section style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Account</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 12 }}>
        <span style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--gg-primary, #2563eb)', color: 'var(--on-primary, #fff)' }}>
          Settings
        </span>
        <Link href="/account/auth" style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: 'rgba(255,255,255,.07)', color: '#fff' }}>
          Login / Logout
        </Link>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {/* Account info */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
          <p style={{ margin: '0 0 2px', fontSize: 12, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed in as</p>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{email ?? '—'}</p>
          {role && (
            <span style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: role === 'admin' ? 'color-mix(in srgb, var(--gg-primary, #2563eb) 25%, transparent)' : 'rgba(255,255,255,.08)', color: role === 'admin' ? 'var(--gg-accent, #93c5fd)' : '#ccc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {role}
            </span>
          )}
        </div>

        {/* Change password */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
          <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 15 }}>Change Password</p>
          <form onSubmit={changePassword} style={{ display: 'grid', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>New Password</label>
              <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Min. 8 characters" />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Confirm Password</label>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat new password" />
            </div>
            {pwErr && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{pwErr}</p>}
            {pwMsg && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>{pwMsg}</p>}
            <button
              type="submit" disabled={pwLoading}
              style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--gg-primary, #2563eb)', color: 'var(--on-primary, #fff)', fontWeight: 600, fontSize: 14, cursor: pwLoading ? 'default' : 'pointer' }}
            >
              {pwLoading ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Sign out everywhere */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(248,113,113,.2)' }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 15 }}>Sign Out Everywhere</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.6 }}>Invalidates all active sessions across every device.</p>
          <button
            onClick={signOutEverywhere} disabled={soLoading}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(248,113,113,.3)', background: 'rgba(248,113,113,.08)', color: '#f87171', fontWeight: 600, fontSize: 14, cursor: soLoading ? 'default' : 'pointer' }}
          >
            {soLoading ? 'Signing out…' : 'Sign Out Everywhere'}
          </button>
        </div>
      </div>
    </section>
  );
}
