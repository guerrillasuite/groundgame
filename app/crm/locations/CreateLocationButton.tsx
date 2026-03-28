"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CreateLocationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [address, setAddress]   = useState("");
  const [city, setCity]         = useState("");
  const [state, setState]       = useState("");
  const [zip, setZip]           = useState("");

  function handleClose() {
    setOpen(false);
    setErr(null);
    setExistingId(null);
    setAddress(""); setCity(""); setState(""); setZip("");
  }

  function submit() {
    if (!address.trim()) { setErr("Address is required"); return; }
    start(async () => {
      try {
        const res = await fetch("/api/crm/locations/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address_line1: address, city, state, postal_code: zip }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          if (data.existingId) setExistingId(data.existingId);
          setErr(data.error ?? "Failed to create location");
          return;
        }
        handleClose();
        router.refresh();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to create location");
      }
    });
  }

  const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
  const dim: React.CSSProperties = { opacity: 0.6 };

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + New Location
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
            borderRadius: 10, padding: 24, width: "100%", maxWidth: 420,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New Location</h3>

            <label style={label}>
              <span style={dim}>Street Address *</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
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

            {err && (
              <div style={{ fontSize: 13, color: "#f87171" }}>
                {err}
                {existingId && (
                  <span>
                    {" "}—{" "}
                    <a
                      href={`/crm/locations/${existingId}`}
                      style={{ color: "#60a5fa", textDecoration: "underline" }}
                      onClick={handleClose}
                    >
                      View existing →
                    </a>
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={handleClose} disabled={pending}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
                {pending ? "Creating…" : "Create Location"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
