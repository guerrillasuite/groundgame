import type { SupabaseClient } from "@supabase/supabase-js";

/** Normalize an address string for comparison: lowercase, no trailing dots, collapsed whitespace. */
export function normalizeAddr(s: string): string {
  return s.trim().toLowerCase()
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ");
}

/** Build a dedup key: "{normalized_address}|{zip}" */
export function addrKey(address: string, zip: string): string | null {
  const a = normalizeAddr(address);
  if (!a) return null;
  return `${a}|${zip.trim()}`;
}

/**
 * Find an existing location by address+zip, or create a new one.
 * Uses tenant-scoped lookup (each tenant owns their own location records).
 */
export async function findOrCreateLocation(
  sb: SupabaseClient,
  tenantId: string,
  fields: { address_line1: string; city?: string; state?: string; postal_code?: string }
): Promise<{ id: string; created: boolean }> {
  const { address_line1, city, state, postal_code = "" } = fields;
  const normalized = normalizeAddr(address_line1);
  if (!normalized) throw new Error("address_line1 is required");

  const incomingKey = addrKey(address_line1, postal_code);

  // Query existing locations with a matching address string (case-insensitive)
  const { data: candidates } = await sb
    .from("locations")
    .select("id, address_line1, postal_code")
    .ilike("address_line1", normalized)
    .eq("tenant_id", tenantId)
    .limit(10);

  for (const loc of candidates ?? []) {
    const k = addrKey(loc.address_line1 ?? "", loc.postal_code ?? "");
    if (k && incomingKey && k === incomingKey) {
      return { id: loc.id, created: false };
    }
  }

  // Not found — create new
  const { data: newLoc, error } = await sb
    .from("locations")
    .insert({
      tenant_id: tenantId,
      address_line1: address_line1.trim(),
      city: city?.trim() || null,
      state: state?.trim() || null,
      postal_code: postal_code.trim() || null,
    })
    .select("id")
    .single();

  if (error || !newLoc) throw new Error(error?.message ?? "Failed to create location");
  return { id: newLoc.id, created: true };
}

/**
 * Find the first household at a location, or create one.
 * addressDisplay is used as the household name for newly created households.
 */
export async function findOrCreateHousehold(
  sb: SupabaseClient,
  tenantId: string,
  locationId: string,
  addressDisplay: string
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await sb
    .from("households")
    .select("id")
    .eq("location_id", locationId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (existing) return { id: existing.id, created: false };

  const { data: newHH, error } = await sb
    .from("households")
    .insert({
      tenant_id: tenantId,
      location_id: locationId,
      name: addressDisplay,
    })
    .select("id")
    .single();

  if (error || !newHH) throw new Error(error?.message ?? "Failed to create household");
  return { id: newHH.id, created: true };
}
