"use client";

import { useState, useTransition } from "react";
import LocationPicker, { type LocationValue } from "@/app/components/crm/LocationPicker";

type Props = {
  action: (formData: FormData) => Promise<void>;
  contactTypes?: { key: string; label: string }[];
  onCreated?: () => void;
};

export default function CreatePersonWizard({ action, contactTypes = [], onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Step 1 fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  // Step 2 fields
  const [location, setLocation] = useState<LocationValue>(null);

  function reset() {
    setStep(1);
    setErr(null);
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setSelectedTypes(new Set());
    setLocation(null);
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  function toggleType(key: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function nextStep() {
    if (!firstName.trim() && !lastName.trim()) {
      setErr("First or last name is required");
      return;
    }
    setErr(null);
    setStep(2);
  }

  function submit() {
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("first_name", firstName);
        fd.set("last_name", lastName);
        fd.set("email", email);
        fd.set("phone", phone);
        fd.set("contact_types", JSON.stringify([...selectedTypes]));

        if (location?.type === "location") {
          fd.set("location_id", location.locationId);
          fd.set("location_display", location.displayText);
        }

        await action(fd);
        handleClose();
        onCreated?.();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to create person");
      }
    });
  }

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,.75)",
    zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16,
  };
  const card: React.CSSProperties = {
    background: "var(--gg-card, #10131b)",
    border: "1px solid var(--gg-border, #22283a)",
    borderRadius: 10,
    padding: 24,
    width: "100%",
    maxWidth: 460,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };
  const lbl: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 4, fontSize: 13,
  };
  const dim: React.CSSProperties = { opacity: 0.6 };
  const row: React.CSSProperties = { display: "flex", gap: 8 };

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + New Person
      </button>

      {open && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
          <div style={card}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New Person</h3>
              <span style={{ fontSize: 12, opacity: 0.5 }}>Step {step} of 2</span>
            </div>

            {step === 1 && (
              <>
                <div style={row}>
                  <label style={{ ...lbl, flex: 1 }}>
                    <span style={dim}>First Name</span>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                  </label>
                  <label style={{ ...lbl, flex: 1 }}>
                    <span style={dim}>Last Name</span>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                  </label>
                </div>
                <label style={lbl}>
                  <span style={dim}>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
                </label>
                <label style={lbl}>
                  <span style={dim}>Phone</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
                </label>

                {contactTypes.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ ...dim, fontSize: 13 }}>Contact Types</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {contactTypes.map((ct) => {
                        const active = selectedTypes.has(ct.key);
                        return (
                          <button
                            key={ct.key}
                            type="button"
                            onClick={() => toggleType(ct.key)}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "4px 12px",
                              borderRadius: 20,
                              border: active
                                ? "1.5px solid rgba(99,102,241,0.6)"
                                : "1.5px solid var(--gg-border, #22283a)",
                              background: active ? "rgba(99,102,241,0.15)" : "transparent",
                              color: active ? "#818cf8" : "rgba(255,255,255,.45)",
                              cursor: "pointer",
                              transition: "all 0.12s",
                            }}
                          >
                            {active && <span style={{ marginRight: 4 }}>✓</span>}
                            {ct.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn" onClick={handleClose}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={nextStep}>
                    Next →
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                  Address (optional — search existing or add a new location)
                </p>
                <LocationPicker
                  value={location}
                  onChange={setLocation}
                  placeholder="Search or add a location…"
                />

                {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <button type="button" className="btn" onClick={() => { setStep(1); setErr(null); }}>
                    ← Back
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn" onClick={handleClose}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
                      {pending ? "Creating…" : "Create Person"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
