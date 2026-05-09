"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFamilyByKey } from "@/lib/sitrep-colors";

const S = {
  bg:     "rgb(10 13 20)",
  card:   "rgb(15 19 28)",
  border: "rgba(255,255,255,.08)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  dimBrt: "rgb(148 163 184)",
} as const;

type UIState = "loading" | "idle" | "accepting" | "declining" | "done_accept" | "done_decline" | "need_signin" | "error" | "not_found";
type InviteInfo = { squadName: string; squadColor: string; inviterName: string; status: string };

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken]   = useState("");
  const [info,  setInfo]    = useState<InviteInfo | null>(null);
  const [uiState, setUiState] = useState<UIState>("loading");
  const [errMsg,  setErrMsg]  = useState("");
  const [isPwa,   setIsPwa]   = useState(false);

  useEffect(() => {
    setIsPwa(window.matchMedia("(display-mode: standalone)").matches);
    params.then(({ token: t }) => {
      setToken(t);
      fetch(`/api/sitrep/invites/${t}`)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((data: InviteInfo) => {
          setInfo(data);
          setUiState(
            data.status === "accepted" ? "done_accept" :
            data.status === "declined" ? "done_decline" : "idle"
          );
        })
        .catch(() => setUiState("not_found"));
    });
  }, []);

  async function respond(action: "accept" | "decline") {
    if (!token) return;
    setUiState(action === "accept" ? "accepting" : "declining");
    try {
      const res = await fetch(`/api/sitrep/invites/${token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.error === "sign_in_required") {
        router.push(`/login?next=/join/${token}`);
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

  const dot  = getFamilyByKey(info?.squadColor ?? "blue")?.shades[3] ?? "#818cf8";
  const busy = uiState === "accepting" || uiState === "declining";

  const InviteCard = () => (
    <div style={{
      background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`,
      borderRadius: 14, padding: "18px 20px", marginBottom: 28,
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {info?.squadName}
        </div>
        <div style={{ fontSize: 12, color: S.dim, marginTop: 2 }}>
          invited by <strong style={{ color: S.dimBrt }}>{info?.inviterName}</strong>
        </div>
      </div>
    </div>
  );

  const GetAppBanner = () => !isPwa ? (
    <div style={{
      marginTop: 24, padding: "12px 16px", borderRadius: 10,
      background: "rgba(255,255,255,.03)", border: `1px solid ${S.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: S.dimBrt }}>📡 Get SitRep on your device</div>
        <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>Install the app for the best experience.</div>
      </div>
      <a href="/download" style={{
        flexShrink: 0, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        background: "rgba(255,255,255,.08)", border: `1px solid ${S.border}`,
        color: S.dimBrt, textDecoration: "none",
      }}>
        Get App
      </a>
    </div>
  ) : null;

  if (uiState === "loading") {
    return (
      <Page>
        <p style={{ color: S.dim, textAlign: "center", fontSize: 14, margin: 0 }}>Loading…</p>
      </Page>
    );
  }

  if (uiState === "not_found") {
    return (
      <Page>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔗</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: S.text }}>Invite not found</h1>
          <p style={{ margin: 0, fontSize: 14, color: S.dim }}>This link is invalid or has already expired.</p>
        </div>
      </Page>
    );
  }

  if (uiState === "done_accept") {
    return (
      <Page>
        <div style={{ fontSize: 44, marginBottom: 12, textAlign: "center" }}>✓</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: S.text, textAlign: "center" }}>You're in!</h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: S.dim, textAlign: "center" }}>
          You've joined <strong style={{ color: S.text }}>{info?.squadName}</strong>. Their items are now in your calendar.
        </p>
        <a href="/list" style={{
          display: "block", textAlign: "center", padding: "12px 0", borderRadius: 10,
          background: "var(--gg-primary,#2563eb)", color: "#fff",
          textDecoration: "none", fontWeight: 700, fontSize: 14,
        }}>
          Open SitRep
        </a>
        <GetAppBanner />
      </Page>
    );
  }

  if (uiState === "done_decline") {
    return (
      <Page>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: S.text }}>Invite declined</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: S.dim }}>You won't be added to "{info?.squadName}".</p>
        <GetAppBanner />
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
          <strong style={{ color: S.dimBrt }}>{info?.inviterName}</strong> wants you to join their squad on SitRep.
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

      <GetAppBanner />
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh", background: S.bg,
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
