"use client";

import { useState, useTransition } from "react";
import { updateContactTypesAction } from "./mutations";

type ContactTypeOption = { key: string; label: string };

type Props = {
  personId: string;
  currentTypes: string[];
  availableTypes: ContactTypeOption[];
  revalidate: string;
};

export default function ContactTypesSelector({ personId, currentTypes, availableTypes, revalidate }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentTypes));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  if (availableTypes.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", fontStyle: "italic" }}>
        No contact types configured. <a href="/crm/settings/contact-types" style={{ color: "var(--gg-primary, #2563eb)" }}>Set them up in Settings</a>.
      </p>
    );
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelected(next);
    setSaved(false);
    start(async () => {
      await updateContactTypesAction(personId, [...next], revalidate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {availableTypes.map((ct) => {
        const active = selected.has(ct.key);
        return (
          <button
            key={ct.key}
            onClick={() => toggle(ct.key)}
            disabled={pending}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 20,
              border: active
                ? "1.5px solid rgba(99,102,241,0.6)"
                : "1.5px solid var(--gg-border, #e5e7eb)",
              background: active ? "rgba(99,102,241,0.1)" : "transparent",
              color: active ? "#4338ca" : "var(--gg-text-dim, #6b7280)",
              cursor: pending ? "default" : "pointer",
              transition: "all 0.12s",
            }}
          >
            {active && <span style={{ marginRight: 4 }}>✓</span>}
            {ct.label}
          </button>
        );
      })}
      {pending && <span style={{ fontSize: 11, opacity: 0.5 }}>Saving…</span>}
      {saved && !pending && <span style={{ fontSize: 11, color: "#16a34a" }}>Saved</span>}
    </div>
  );
}
