"use client";

import { useState, useTransition } from "react";
import LocationSearchInput from "@/app/crm/_shared/LocationSearchInput";

type LocationValue =
  | { type: "existing"; id: string; address: string }
  | { type: "new"; address: string };

export default function CreateHouseholdButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [city, setCity]   = useState("");
  const [state, setState] = useState("");
  const [zip, setZip]     = useState("");

  function handleClose() {
    setOpen(false);
    setErr(null);
    setName(""); setLocation(null); setCity(""); setState(""); setZip("");
  }

  function submit() {
    if (!location) { setErr("Address is required"); return; }
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("address_line1", location.address);
        if (location.type === "new") {
          fd.set("city", city);
          fd.set("state", state);
          fd.set("postal_code", zip);
        }
        const res = await fetch("/api/crm/households/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name || null,
            address_line1: location.address,
            city: location.type === "new" ? city : undefined,
            state: location.type === "new" ? state : undefined,
            postal_code: location.type === "new" ? zip : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create household");
        handleClose();
        window.location.reload();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to create household");
      }
    });
  }

  const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
  const dim: React.CSSProperties = { opacity: 0.6 };
  const row: React.CSSProperties = { display: "flex", gap: 8 };

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + New Household
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div style={{
            background: "var(--gg-card, #10131b)",
            border: "1px solid var(--gg-border, #22283a)",
            borderRadius: 10, padding: 24, width: "100%", maxWidth: 440,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New Household</h3>

            <label style={label}>
              <span style={dim}>Household Name (optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Smith Family" />
            </label>

            <label style={label}>
              <span style={dim}>Address *</span>
              <LocationSearchInput value={location} onChange={setLocation} />
            </label>

            {location?.type === "new" && (
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
            )}

            {location?.type === "existing" && (
              <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>✓ Existing location found — will link to it</p>
            )}

            {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={handleClose} disabled={pending}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
                {pending ? "Creating…" : "Create Household"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
