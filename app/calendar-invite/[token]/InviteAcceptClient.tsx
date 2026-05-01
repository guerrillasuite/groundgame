"use client";

import { useState } from "react";

const S = {
  bg:   "rgb(10 13 20)",
  card: "rgb(20 25 38)",
  border: "rgba(255,255,255,.08)",
  text: "rgb(236 240 245)",
  dim:  "rgb(100 116 139)",
} as const;

export default function InviteAcceptClient({
  token, viewName, role, email, alreadyHandled,
}: {
  token:          string;
  viewName:       string;
  role:           string;
  email:          string;
  alreadyHandled: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "accepting" | "declining" | "done_accept" | "done_decline" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function respond(action: "accept" | "decline") {
    setStatus(action === "accept" ? "accepting" : "declining");
    try {
      const res = await fetch(`/api/calendar-invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setStatus(action === "accept" ? "done_accept" : "done_decline");
      } else {
        const e = await res.json().catch(() => ({}));
        setErrMsg(e.error ?? "Something went wrong.");
        setStatus("error");
      }
    } catch {
      setErrMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  const busy = status === "accepting" || status === "declining";

  if (alreadyHandled) {
    return (
      <Page>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: S.text }}>
          Invite {alreadyHandled === "accepted" ? "already accepted" : "already declined"}
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: S.dim }}>
          {alreadyHandled === "accepted"
            ? `You already accepted access to "${viewName}". Visit the calendar to see it.`
            : "This invite was already declined."}
        </p>
        {alreadyHandled === "accepted" && (
          <a href="/crm/sitrep/calendar" style={{ display: "inline-block", marginTop: 20, padding: "10px 22px", borderRadius: 10, background: "var(--gg-primary,#2563eb)", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
            Open Calendar
          </a>
        )}
      </Page>
    );
  }

  if (status === "done_accept") {
    return (
      <Page>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: S.text }}>Invite accepted!</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: S.dim }}>
          "{viewName}" is now in your calendar as a <strong style={{ color: S.text }}>{role}</strong>.
        </p>
        <a href="/crm/sitrep/calendar" style={{ display: "inline-block", padding: "10px 22px", borderRadius: 10, background: "var(--gg-primary,#2563eb)", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
          Open Calendar
        </a>
      </Page>
    );
  }

  if (status === "done_decline") {
    return (
      <Page>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: S.text }}>Invite declined.</h1>
        <p style={{ margin: 0, fontSize: 14, color: S.dim }}>You won't see "{viewName}" in your calendar.</p>
      </Page>
    );
  }

  return (
    <Page>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: S.text }}>Calendar Invite</h1>
      <p style={{ margin: "0 0 6px", fontSize: 14, color: S.dim }}>
        You've been invited to view <strong style={{ color: S.text }}>{viewName}</strong> as a <strong style={{ color: S.text }}>{role}</strong>.
      </p>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: S.dim }}>Sent to: {email}</p>
      {status === "error" && (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#fca5a5" }}>{errMsg}</p>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => respond("accept")}
          disabled={busy}
          style={{
            padding: "11px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700,
            border: "none", cursor: busy ? "not-allowed" : "pointer",
            background: "var(--gg-primary,#2563eb)", color: "#fff",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {status === "accepting" ? "Accepting…" : "Accept"}
        </button>
        <button
          onClick={() => respond("decline")}
          disabled={busy}
          style={{
            padding: "11px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: `1px solid ${S.border}`, cursor: busy ? "not-allowed" : "pointer",
            background: "rgba(255,255,255,.05)", color: S.dim,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {status === "declining" ? "Declining…" : "Decline"}
        </button>
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{
        width: "100%", maxWidth: 440,
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 20, padding: "40px 36px",
      }}>
        {children}
      </div>
    </div>
  );
}
