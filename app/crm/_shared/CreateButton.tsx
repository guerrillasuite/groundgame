"use client";

import { useState, useTransition } from "react";

export type FieldDef = {
  name: string;
  label?: string;
  type?: "text" | "textarea" | "number" | "email" | "tel" | "date" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
};

type Props = {
  title?: string;
  buttonLabel?: string;
  fields: FieldDef[];
  action: (formData: FormData) => Promise<void>;
  onCreated?: () => void;
};

export default function CreateButton({
  title = "New Record",
  buttonLabel = "+ New",
  fields,
  action,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.name] = "";
    return v;
  });
  const [err, setErr] = useState<string | null>(null);

  function set(name: string, value: string) {
    setVals((s) => ({ ...s, [name]: value }));
  }

  function handleClose() {
    setOpen(false);
    setErr(null);
    const reset: Record<string, string> = {};
    for (const f of fields) reset[f.name] = "";
    setVals(reset);
  }

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,.7)",
            zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <form
            style={{
              background: "var(--gg-card, #10131b)",
              border: "1px solid var(--gg-border, #22283a)",
              borderRadius: 10,
              padding: 24,
              width: "100%",
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
            action={(fd) => {
              setErr(null);
              start(async () => {
                try {
                  for (const f of fields) fd.set(f.name, vals[f.name] ?? "");
                  await action(fd);
                  handleClose();
                  onCreated?.();
                } catch (e: any) {
                  setErr(e?.message ?? "Failed to create record");
                }
              });
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>

            {fields.map((f) => {
              const label = f.label ?? f.name;
              const v = vals[f.name] ?? "";

              if (f.type === "textarea") {
                return (
                  <label key={f.name} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <span style={{ opacity: 0.7 }}>{label}</span>
                    <textarea
                      name={f.name}
                      placeholder={f.placeholder}
                      value={v}
                      rows={3}
                      onChange={(e) => set(f.name, e.target.value)}
                      style={{ resize: "vertical" }}
                    />
                  </label>
                );
              }

              if (f.type === "select" && f.options) {
                return (
                  <label key={f.name} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <span style={{ opacity: 0.7 }}>{label}</span>
                    <select
                      name={f.name}
                      value={v}
                      onChange={(e) => set(f.name, e.target.value)}
                    >
                      <option value="">— select —</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                );
              }

              return (
                <label key={f.name} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  <span style={{ opacity: 0.7 }}>{label}</span>
                  <input
                    name={f.name}
                    type={f.type ?? "text"}
                    placeholder={f.placeholder}
                    value={v}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                </label>
              );
            })}

            {err && (
              <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" className="btn" onClick={handleClose} disabled={pending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
