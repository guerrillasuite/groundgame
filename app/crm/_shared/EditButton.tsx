"use client";

import { useState, useTransition } from "react";

type FieldDef = {
  name: string;
  label?: string;
  type?: "text" | "textarea" | "number";
  placeholder?: string;
};

type Props = {
  id: string;
  action: (formData: FormData) => Promise<void>; // server action binder
  fields: FieldDef[];
  initial?: Record<string, any>;
  title?: string;
};

export default function EditButton({ id, action, fields, initial = {}, title = "Edit" }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [vals, setVals] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {};
    for (const f of fields) v[f.name] = initial[f.name] ?? "";
    return v;
  });

  function set(name: string, value: any) {
    setVals((s) => ({ ...s, [name]: value }));
  }

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Edit</button>

      {open && (
        <div className="modal">
          <form
            action={(fd) => {
              start(async () => {
                fd.set("id", id);
                for (const f of fields) fd.set(f.name, vals[f.name] ?? "");
                await action(fd);
                setOpen(false);
              });
            }}
            className="card"
          >
            <h3 style={{marginTop:0}}>{title}</h3>

            {fields.map((f) => {
              const label = f.label ?? f.name;
              const type = f.type ?? "text";
              const v = vals[f.name] ?? "";
              if (type === "textarea") {
                return (
                  <label key={f.name} className="stack" style={{gap:4}}>
                    <span>{label}</span>
                    <textarea
                      name={f.name}
                      placeholder={f.placeholder}
                      value={v}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  </label>
                );
              }
              return (
                <label key={f.name} className="stack" style={{gap:4}}>
                  <span>{label}</span>
                  <input
                    name={f.name}
                    type={type}
                    placeholder={f.placeholder}
                    value={v}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                </label>
              );
            })}

            <div className="row" style={{gap:8, marginTop:8}}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
