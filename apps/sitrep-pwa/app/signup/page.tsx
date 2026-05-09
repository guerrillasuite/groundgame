"use client";

import { useState, FormEvent, Suspense } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const S = {
  bg:     "rgb(10 13 20)",
  card:   "rgb(20 25 38)",
  border: "rgba(255,255,255,.08)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,.05)",
  border: `1px solid ${S.border}`,
  color: S.text,
  fontSize: 15,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6,
  color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase",
};

function focusStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  e.currentTarget.style.boxShadow   = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
}
function blurStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = S.border;
  e.currentTarget.style.boxShadow   = "none";
}

function SignupForm() {
  const router = useRouter();

  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);

    const { data, error: authErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name:  name.trim(),
          phone: phone.trim() || undefined,
        },
      },
    });

    setLoading(false);

    if (authErr) { setError(authErr.message); return; }

    if (data.session) {
      // Email confirmation disabled — immediately signed in
      router.push("/list");
    } else {
      // Email confirmation required
      setDone(true);
    }
  }

  if (done) {
    return (
      <div style={{
        minHeight: "100dvh", background: S.bg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "24px 20px",
      }}>
        <div style={{
          width: "100%", maxWidth: 360,
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: "32px 24px",
          textAlign: "center", display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 40 }}>📬</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: S.text }}>Check your inbox</div>
          <div style={{ fontSize: 14, color: S.dim, lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: S.text }}>{email}</strong>.
            Click it to activate your account.
          </div>
          <a href="/login" style={{ fontSize: 13, color: "var(--gg-primary,#2563eb)", marginTop: 8 }}>
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100dvh", background: S.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
      paddingBottom: "max(24px, env(safe-area-inset-bottom))",
    }}>
      {/* Icon + wordmark */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: S.card, border: `1px solid ${S.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, margin: "0 auto 14px",
        }}>📡</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: S.text }}>SitRep</div>
        <div style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>Create your account</div>
      </div>

      <form onSubmit={handleSubmit} style={{
        width: "100%", maxWidth: 360,
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, padding: "24px 20px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            type="text" autoComplete="name" required
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Phone <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>(optional)</span></label>
          <input
            type="tel" autoComplete="tel"
            value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 000 0000"
            style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password" autoComplete="new-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Confirm Password</label>
          <input
            type="password" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}
          />
        </div>

        {error && (
          <div style={{
            background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)",
            borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#fca5a5",
          }}>{error}</div>
        )}

        <button
          type="submit" disabled={loading}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 15, fontWeight: 600,
            background: loading
              ? "rgba(255,255,255,.08)"
              : "linear-gradient(135deg, var(--gg-primary, #2563eb) 0%, color-mix(in srgb, var(--gg-primary, #2563eb) 70%, #7c3aed) 100%)",
            color: loading ? S.dim : "#fff",
            boxShadow: loading ? "none" : "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)",
            transition: "opacity .15s", marginTop: 4,
          }}
        >{loading ? "Creating account…" : "Create Account"}</button>

        <p style={{ fontSize: 12, color: S.dim, textAlign: "center", margin: 0 }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--gg-primary,#2563eb)", textDecoration: "none" }}>Sign in</a>
        </p>
      </form>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
