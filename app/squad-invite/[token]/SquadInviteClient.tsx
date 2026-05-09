"use client";

import { useState } from "react";
import { getFamilyByKey } from "@/lib/sitrep-colors";

const S = {
  bg:     "rgb(10 13 20)",
  card:   "rgb(20 25 38)",
  border: "rgba(255,255,255,.08)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  dimBrt: "rgb(160 174 192)",
} as const;

type UIState = "idle" | "accepting" | "declining" | "done_accept" | "done_decline" | "need_signin" | "error";

export default function SquadInviteClient({
  token, squadName, squadColor, inviterName, inviteStatus,
}: {
  token:        string;
  squadName:    string;
  squadColor:   string;
  inviterName:  string;
  inviteStatus: "pending" | "accepted" | "declined";
}) {
  const initial: UIState =
    inviteStatus === "accepted" ? "done_accept" :
    inviteStatus === "declined" ? "done_decline" : "idle";

  const [uiState, setUiState] = useState<UIState>(initial);
  const [errMsg,  setErrMsg]  = useState("");

  const dot  = getFamilyByKey(squadColor)?.shades[3] ?? "#818cf8";
  const busy = uiState === "accepting" || uiState === "declining";

  async function respond(action: "accept" | "decline") {
    setUiState(action === "accept" ? "accepting" : "declining");
    try {
      const res = await fetch(`/api/squad-invite/${token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 && data.error === "sign_in_required") {
        setUiState("need_signin");
        return;
      }
      if (!res.ok) { setErrMsg(data.error ?? "Something went wrong."); setUiState("error"); return; }
      if (data.already) { setUiState(data.already === "accepted" ? "done_accept" : "done_decline"); return; }
      setUiState(action === "accept" ? "done_accept" : "done_decline");
    } catch {
      setErrMsg("Network error. Please try again.");
      setUiState("error");
    }
  }

  const InviteCard = () => (
    <div style={{
      background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`,
      borderRadius: 14, padding: "18px 20px", marginBottom: 28,
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {squadName}
        </div>
        <div style={{ fontSize: 12, color: S.dim, marginTop: 2 }}>
          invited by <strong style={{ color: S.dimBrt }}>{inviterName}</strong>
        </div>
      </div>
    </div>
  );

  if (uiState === "done_accept") {
    return (
      <Page>
        <div style={{ fontSize: 44, marginBottom: 12, textAlign: "center" }}>✓</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: S.text, textAlign: "center" }}>You're in!</h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: S.dim, textAlign: "center" }}>
          You've joined <strong style={{ color: S.text }}>{squadName}</strong>. Their items are now in your calendar.
        </p>
        <a href="/crm/sitrep/calendar" style={{
          display: "block", textAlign: "center", padding: "12px 0", borderRadius: 10,
          background: "var(--gg-primary,#2563eb)", color: "#fff",
          textDecoration: "none", fontWeight: 700, fontSize: 14,
        }}>
          Open Calendar
        </a>
      </Page>
    );
  }

  if (uiState === "done_decline") {
    return (
      <Page>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: S.text }}>Invite declined</h1>
        <p style={{ margin: 0, fontSize: 14, color: S.dim }}>You won't be added to "{squadName}".</p>
      </Page>
    );
  }

  if (uiState === "need_signin") {
    const redirect = encodeURIComponent(`/squad-invite/${token}`);
    return (
      <Page>
        <InviteCard />
        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: S.text }}>Sign in to accept</h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: S.dim }}>
          You need to be signed in to accept this squad invitation.
        </p>
        <a href={`/crm/login?redirect=${redirect}`} style={{
          display: "block", textAlign: "center", padding: "12px 0", borderRadius: 10,
          background: "var(--gg-primary,#2563eb)", color: "#fff",
          textDecoration: "none", fontWeight: 700, fontSize: 14,
        }}>
          Sign In
        </a>
      </Page>
    );
  }

  return (
    <Page>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: S.dim, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
          Squad Invite
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: S.text }}>You're invited</h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: S.dim }}>
          <strong style={{ color: S.dimBrt }}>{inviterName}</strong> wants you to join their squad on SitRep.
        </p>
      </div>

      <InviteCard />

      <p style={{ margin: "0 0 6px", fontSize: 13, color: S.dim }}>
        As a collaborator you'll see shared squad items on your calendar.
      </p>

      {uiState === "error" && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "#fca5a5" }}>{errMsg}</p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button
          onClick={() => respond("accept")}
          disabled={busy}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 10, fontSize: 14, fontWeight: 700,
            border: "none", cursor: busy ? "not-allowed" : "pointer",
            background: "var(--gg-primary,#2563eb)", color: "#fff", opacity: busy ? 0.7 : 1,
          }}
        >
          {uiState === "accepting" ? "Accepting…" : "Accept Invite"}
        </button>
        <button
          onClick={() => respond("decline")}
          disabled={busy}
          style={{
            padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: `1px solid ${S.border}`, cursor: busy ? "not-allowed" : "pointer",
            background: "rgba(255,255,255,.04)", color: S.dim, opacity: busy ? 0.7 : 1,
          }}
        >
          {uiState === "declining" ? "…" : "Decline"}
        </button>
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: S.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
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
