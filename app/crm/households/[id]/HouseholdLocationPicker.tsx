"use client";

import { useState } from "react";
import LocationPicker, { type LocationValue } from "@/app/components/crm/LocationPicker";

type Props = {
  householdId: string;
  locationId: string | null;
  displayText: string;
};

export default function HouseholdLocationPicker({ householdId, locationId, displayText }: Props) {
  const [value, setValue] = useState<LocationValue>(
    locationId ? { type: "location", locationId, displayText } : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleChange(v: LocationValue) {
    setValue(v);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/households/${householdId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: v?.type === "location" ? v.locationId : null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to save");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <div>
      <LocationPicker value={value} onChange={handleChange} mode="full" />
      {saving && <div style={{ fontSize: 12, marginTop: 4, color: "#64748b" }}>Saving…</div>}
      {error  && <div style={{ fontSize: 12, marginTop: 4, color: "#ef4444" }}>{error}</div>}
    </div>
  );
}
