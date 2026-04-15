"use client";

import { type DispatchDomain } from "./ComposeFlow";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-input, white)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 5,
  color: "var(--gg-text-dim, #6b7280)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export type DetailsData = {
  name: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_local: string;   // local part, e.g. "jessi"
  from_domain: string;  // domain, e.g. "mail.groundgame.digital"
  reply_to: string;
};

interface Props {
  data: DetailsData;
  onChange: (patch: Partial<DetailsData>) => void;
  domains: DispatchDomain[];
}

export default function StepDetails({ data, onChange, domains }: Props) {
  const subjectLen = data.subject.length;
  const fromEmail = data.from_local && data.from_domain
    ? `${data.from_local}@${data.from_domain}`
    : "";

  // Default domain list — always includes GS default
  const allDomains = domains.length > 0 ? domains : [{ domain: "mail.groundgame.digital", verified: true }];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Campaign Details</h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
          Set the campaign name, subject line, and sender information.
        </p>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {/* Campaign name */}
        <div>
          <label style={labelStyle}>
            Campaign Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            style={inputStyle}
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. April Fundraising Blast"
          />
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
            Internal name — not shown to recipients.
          </p>
        </div>

        {/* Subject line */}
        <div>
          <label style={labelStyle}>
            Subject Line <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            style={inputStyle}
            value={data.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="e.g. We need your help before Tuesday"
          />
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: subjectLen > 60 ? "#d97706" : "var(--gg-text-dim, #6b7280)",
            }}
          >
            {subjectLen} characters{subjectLen > 60 ? " — over 60, may be truncated in some inboxes" : ""}
          </p>
        </div>

        {/* Preview text */}
        <div>
          <label style={labelStyle}>Preview Text</label>
          <input
            style={inputStyle}
            value={data.preview_text}
            onChange={(e) => onChange({ preview_text: e.target.value })}
            placeholder="Optional inbox preheader text…"
          />
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
            Shown after the subject line in most inboxes before the email is opened.
          </p>
        </div>

        {/* From name */}
        <div>
          <label style={labelStyle}>
            From Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            style={inputStyle}
            value={data.from_name}
            onChange={(e) => onChange({ from_name: e.target.value })}
            placeholder="e.g. Jessi Cowart for Texas House"
          />
        </div>

        {/* From email */}
        <div>
          <label style={labelStyle}>
            From Email <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={data.from_local}
              onChange={(e) => onChange({ from_local: e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, "") })}
              placeholder="sender"
            />
            <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0 }}>@</span>
            <select
              style={{
                ...inputStyle,
                flex: 2,
                padding: "9px 28px 9px 12px",
                cursor: "pointer",
              }}
              value={data.from_domain}
              onChange={(e) => onChange({ from_domain: e.target.value })}
            >
              {allDomains.map((d) => (
                <option key={d.domain} value={d.domain}>
                  {d.domain}{d.verified ? "" : " (unverified)"}
                </option>
              ))}
            </select>
          </div>
          {fromEmail && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
              Sends as: <strong>{fromEmail}</strong>
              {!allDomains.find((d) => d.domain === data.from_domain)?.verified && (
                <span style={{ color: "#d97706", marginLeft: 8 }}>⚠ Domain not verified</span>
              )}
            </p>
          )}
        </div>

        {/* Reply-to */}
        <div>
          <label style={labelStyle}>Reply-To Email</label>
          <input
            style={inputStyle}
            type="email"
            value={data.reply_to}
            onChange={(e) => onChange({ reply_to: e.target.value })}
            placeholder="e.g. office@cowartforhouston.com"
          />
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gg-text-dim, #6b7280)" }}>
            Optional. If set, replies from recipients go here instead of the from address.
          </p>
        </div>
      </div>
    </div>
  );
}
