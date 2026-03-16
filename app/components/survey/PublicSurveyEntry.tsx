"use client";

import { useState } from "react";
import { SurveyContainer } from "./SurveyContainer";

type Stage = "lookup" | "not-found" | "ready";

function getOrCreateAnonId(): string {
  const key = "gg_anon_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "anon_" + crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

interface Props {
  surveyId: string;
}

export default function PublicSurveyEntry({ surveyId }: Props) {
  const [stage, setStage] = useState<Stage>("lookup");
  const [contactId, setContactId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledFields = [firstName, lastName, email, phone].filter((v) => v.trim()).length;
  const canSubmit = filledFields >= 2;

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
          survey_id: surveyId,
        }),
      });
      const data = await res.json();
      if (data.contact_id) {
        setContactId(data.contact_id);
        setStage("ready");
      } else {
        setStage("not-found");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function continueAnonymously() {
    const anonId = getOrCreateAnonId();
    setContactId(anonId);
    setStage("ready");
  }

  if (stage === "ready" && contactId) {
    return <SurveyContainer surveyId={surveyId} contactId={contactId} randomizeOptions={true} />;
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid rgb(var(--border-600, 75 85 99))",
    background: "rgb(var(--surface-700, 55 65 81))",
    color: "rgb(var(--text-100, 249 250 251))",
    fontSize: 15,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "rgb(var(--text-200, 229 231 235))",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgb(var(--bg-900))",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "rgb(var(--surface-800, 31 41 55))",
          borderRadius: 16,
          padding: 32,
          border: "1px solid rgb(var(--border-600, 75 85 99))",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {stage === "lookup" && (
          <>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 22,
                fontWeight: 700,
                color: "rgb(var(--text-100, 249 250 251))",
              }}
            >
              Verify Your Identity
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                color: "rgb(var(--text-300, 156 163 175))",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Enter at least two of the fields below so we can find your record.
            </p>

            <form onSubmit={handleLookup} style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>First Name</label>
                  <input
                    style={inputStyle}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Last Name</label>
                  <input
                    style={inputStyle}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 867-5309"
                  autoComplete="tel"
                />
              </div>

              {error && (
                <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  background: canSubmit ? "#2563eb" : "rgba(37,99,235,0.4)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 15,
                  border: "none",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                {loading ? "Searching…" : "Continue"}
              </button>
            </form>
          </>
        )}

        {stage === "not-found" && (
          <>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 22,
                fontWeight: 700,
                color: "rgb(var(--text-100, 249 250 251))",
              }}
            >
              Record Not Found
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                color: "rgb(var(--text-300, 156 163 175))",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              We couldn&apos;t find your record in our system. You can still complete the survey
              anonymously, or go back and try different information.
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              <button
                onClick={continueAnonymously}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  background: "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 15,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Continue Anonymously
              </button>
              <button
                onClick={() => { setStage("lookup"); setError(null); }}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.08)",
                  color: "rgb(var(--text-200, 229 231 235))",
                  fontWeight: 600,
                  fontSize: 15,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
