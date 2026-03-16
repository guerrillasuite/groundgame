'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase/client";

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--brand-text, #fff)',
  fontSize: 14,
  boxSizing: 'border-box',
};

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErr(error.message);
    } else {
      setMsg('Password set! Taking you home…');
      setTimeout(() => router.replace('/'), 1500);
    }
    setLoading(false);
  }

  return (
    <section style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Set Your Password</h1>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>Choose a password you'll use to sign in.</p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>New Password</label>
          <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.6, display: 'block', marginBottom: 4 }}>Confirm Password</label>
          <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Same password again" style={INPUT} />
        </div>
        {msg && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>{msg}</p>}
        {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
        <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--brand-primary, #2563eb)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: loading ? 'default' : 'pointer' }}>
          {loading ? 'Saving…' : 'Set Password'}
        </button>
      </form>
    </section>
  );
}
