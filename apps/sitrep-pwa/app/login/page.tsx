"use client";

import { useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const S = {
  bg:      "rgb(10 13 20)",
  card:    "rgb(20 25 38)",
  border:  "rgba(255,255,255,.08)",
  text:    "rgb(236 240 245)",
  dim:     "rgb(100 116 139)",
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

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/list";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      return;
    }

    // Store tenant ID for client-side Supabase headers
    if (data.user) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: memberships } = await sb
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", data.user.id)
          .in("status", ["active", "invited"])
          .order("created_at")
          .limit(1);
        if (memberships?.[0]?.tenant_id) {
          localStorage.setItem("sitrep_tenant_id", memberships[0].tenant_id);
        }
      } catch {}
    }

    router.push(next);
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor =
      "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
    e.currentTarget.style.boxShadow =
      "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = S.border;
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: S.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 20px",
      paddingBottom: "max(24px, env(safe-area-inset-bottom))",
    }}>
      {/* Icon + wordmark */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: S.card,
          border: `1px solid ${S.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          margin: "0 auto 14px",
        }}>
          📡
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: S.text }}>
          SitRep
        </div>
        <div style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>
          Tasks, events, and calendar
        </div>
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: S.card,
          border: `1px solid ${S.border}`,
          borderRadius: 16,
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <label style={{
            fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6,
            color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={inputStyle}
            onFocus={focusStyle}
            onBlur={blurStyle}
          />
        </div>

        <div>
          <label style={{
            fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6,
            color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={inputStyle}
            onFocus={focusStyle}
            onBlur={blurStyle}
          />
        </div>

        {error && (
          <div style={{
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.3)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            color: "#fca5a5",
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "13px 0",
            borderRadius: 10,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 15,
            fontWeight: 600,
            background: loading
              ? "rgba(255,255,255,.08)"
              : "linear-gradient(135deg, var(--gg-primary, #2563eb) 0%, color-mix(in srgb, var(--gg-primary, #2563eb) 70%, #7c3aed) 100%)",
            color: loading ? S.dim : "#fff",
            boxShadow: loading
              ? "none"
              : "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)",
            transition: "opacity .15s",
            marginTop: 4,
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p style={{ fontSize: 12, color: S.dim, textAlign: "center", margin: 0 }}>
          No account?{" "}
          <a href="/signup" style={{ color: "var(--gg-primary,#2563eb)", textDecoration: "none" }}>Create one</a>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
