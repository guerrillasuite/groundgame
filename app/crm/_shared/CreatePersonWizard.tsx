"use client";

import { useState, useTransition } from "react";
import LocationSearchInput from "./LocationSearchInput";

type LocationValue =
  | { type: "existing"; id: string; address: string }
  | { type: "new"; address: string };

type Props = {
  action: (formData: FormData) => Promise<void>;
  onCreated?: () => void;
};

const CONTACT_TYPES = [
  { value: "", label: "— none —" },
  { value: "supporter", label: "Supporter" },
  { value: "volunteer", label: "Volunteer" },
  { value: "donor", label: "Donor" },
  { value: "prospect", label: "Prospect" },
  { value: "voter", label: "Voter" },
  { value: "other", label: "Other" },
];

export default function CreatePersonWizard({ action, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Step 1 fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [contactType, setContactType] = useState("");

  // Step 2 fields
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [city, setCity]         = useState("");
  const [state, setState]       = useState("");
  const [zip, setZip]           = useState("");

  function reset() {
    setStep(1);
    setErr(null);
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setContactType("");
    setLocation(null); setCity(""); setState(""); setZip("");
  }

  function handleClose() {
    setOpen(false);
    reset();
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
        fd.set("contact_type", contactType);

        if (location) {
          const addr = location.address;
          fd.set("address_line1", addr);
          // For new addresses, use the manual city/state/zip fields
          if (location.type === "new") {
            fd.set("city", city);
            fd.set("state", state);
            fd.set("postal_code", zip);
          }
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
    maxWidth: 440,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };
  const label: React.CSSProperties = {
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
                  <label style={{ ...label, flex: 1 }}>
                    <span style={dim}>First Name</span>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                  </label>
                  <label style={{ ...label, flex: 1 }}>
                    <span style={dim}>Last Name</span>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                  </label>
                </div>
                <label style={label}>
                  <span style={dim}>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
                </label>
                <label style={label}>
                  <span style={dim}>Phone</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
                </label>
                <label style={label}>
                  <span style={dim}>Contact Type</span>
                  <select value={contactType} onChange={(e) => setContactType(e.target.value)}>
                    {CONTACT_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>

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
                  Address (optional — links to an existing location or creates a new one)
                </p>
                <label style={label}>
                  <span style={dim}>Address</span>
                  <LocationSearchInput
                    value={location}
                    onChange={setLocation}
                    placeholder="Search or type a street address…"
                  />
                </label>

                {location?.type === "new" && (
                  <>
                    <div style={row}>
                      <label style={{ ...label, flex: 2 }}>
                        <span style={dim}>City</span>
                        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Springfield" />
                      </label>
                      <label style={{ ...label, flex: 1 }}>
                        <span style={dim}>State</span>
                        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="IL" maxLength={2} />
                      </label>
                      <label style={{ ...label, flex: 1 }}>
                        <span style={dim}>Zip</span>
                        <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="62701" maxLength={10} />
                      </label>
                    </div>
                  </>
                )}

                {location?.type === "existing" && (
                  <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>
                    ✓ Existing location found — will link to it
                  </p>
                )}

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
