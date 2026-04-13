"use server";

import { revalidatePath } from "next/cache";
import { getTenant } from "@/lib/tenant";
import { getServerSupabaseWritable } from "@/lib/supabase/server";
import { findOrCreateLocation, findOrCreateHousehold } from "@/lib/crm/location-utils";
import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/**
 * Whitelist fields per table you want editable. This prevents arbitrary writes.
 * Add more tables/fields here as you expand.
 */
const EDITABLE_FIELDS: Record<string, readonly string[]> = {
  people: [
    "title", "first_name", "middle_name", "middle_initial", "last_name", "suffix",
    "email", "phone", "notes", "household_id",
    "phone_cell", "phone_landline",
  ],
  locations: [
    "address_line1", "address_line2", "city", "state", "postal_code",
    "normalized_key", "notes"
  ],
  households: [
    "name", "location_id", "notes"
  ],
  companies: [
    "name", "domain", "phone", "email", "industry", "status", "presence",
  ],
  opportunities: [
    "title", "amount_cents", "description", "notes", "contact_person_id",
    "stage", "order_index", "due_at", "priority", "source", "pipeline",
  ],
  // add lists, stops, etc.
};

function pickEditable(table: string, formData: FormData) {
  const allowed = EDITABLE_FIELDS[table] || [];
  const update: Record<string, any> = {};
  for (const key of allowed) {
    if (formData.has(key)) update[key] = formData.get(key);
  }
  return update;
}

function getRowId(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing id");
  return id;
}

/** Generic UPDATE for any whitelisted table */
export async function updateRowAction(
  table: keyof typeof EDITABLE_FIELDS,
  revalidate: string,
  formData: FormData
) {
  const id = getRowId(formData);
  const updates = pickEditable(table, formData);
  const sb = getServerSupabaseWritable();
  const tenant = await getTenant();

  // guard: nothing to update
  if (!Object.keys(updates).length) {
    throw new Error(`No editable fields found for ${table}`);
  }

  const { error } = await sb
    .from(table)
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .limit(1);

  if (error) throw error;
  revalidatePath(revalidate);
}

/** Optional: CREATE & DELETE helpers (same whitelist/tenant guard) */
export async function createRowAction(
  table: keyof typeof EDITABLE_FIELDS,
  revalidate: string,
  formData: FormData
) {
  const data = pickEditable(table, formData);
  const sb = getServerSupabaseWritable();
  const tenant = await getTenant();

  const payload = { ...data, tenant_id: tenant.id };
  const { error } = await sb.from(table).insert(payload).single();
  if (error) throw error;
  revalidatePath(revalidate);
}

/**
 * Create a person with optional household+location linkage.
 * formData keys: first_name, last_name, email, phone, contact_type,
 *                address_line1, city, state, postal_code  (address fields optional)
 */
export async function createPersonAction(
  revalidate: string,
  formData: FormData
) {
  const sb = getServerSupabaseWritable();
  const tenant = await getTenant();

  const firstName  = String(formData.get("first_name")  ?? "").trim();
  const lastName   = String(formData.get("last_name")   ?? "").trim();
  const email      = String(formData.get("email")       ?? "").trim().toLowerCase() || null;
  const phone      = String(formData.get("phone")       ?? "").trim() || null;
  const contactType = String(formData.get("contact_type") ?? "").trim() || null;
  const address    = String(formData.get("address_line1") ?? "").trim();
  const city       = String(formData.get("city")        ?? "").trim() || undefined;
  const state      = String(formData.get("state")       ?? "").trim() || undefined;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || undefined;

  if (!firstName && !lastName) throw new Error("First or last name is required");

  // Find or create location + household if address provided
  let householdId: string | null = null;
  if (address) {
    const loc = await findOrCreateLocation(sb as any, tenant.id, {
      address_line1: address, city, state, postal_code: postalCode,
    });
    const hh = await findOrCreateHousehold(sb as any, tenant.id, loc.id, address);
    householdId = hh.id;
  }

  // Insert person
  const { data: newPerson, error: pErr } = await sb
    .from("people")
    .insert({
      first_name: firstName || null,
      last_name: lastName || null,
      email,
      phone,
      household_id: householdId,
      data_source: "manual",
      data_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (pErr || !newPerson) throw new Error(pErr?.message ?? "Failed to create person");

  // Link to tenant — write to contact_types array (canonical), not singular contact_type
  await sb.from("tenant_people").upsert(
    {
      tenant_id: tenant.id,
      person_id: (newPerson as any).id,
      linked_at: new Date().toISOString(),
      contact_types: contactType ? [contactType] : [],
    },
    { onConflict: "tenant_id,person_id", ignoreDuplicates: false }
  );

  revalidatePath(revalidate);
}

/**
 * Create a household with optional find-or-create location.
 * formData keys: name (optional), address_line1, city, state, postal_code
 */
export async function createHouseholdAction(
  revalidate: string,
  formData: FormData
) {
  const sb = getServerSupabaseWritable();
  const tenant = await getTenant();

  const name    = String(formData.get("name")         ?? "").trim() || null;
  const address = String(formData.get("address_line1") ?? "").trim();
  const city    = String(formData.get("city")         ?? "").trim() || undefined;
  const state   = String(formData.get("state")        ?? "").trim() || undefined;
  const zip     = String(formData.get("postal_code")  ?? "").trim() || undefined;

  if (!address) throw new Error("Address is required");

  const loc = await findOrCreateLocation(sb as any, tenant.id, {
    address_line1: address, city, state, postal_code: zip,
  });

  // Check if household already exists at this location
  const { data: existing } = await sb
    .from("households")
    .select("id")
    .eq("location_id", loc.id)
    .eq("tenant_id", tenant.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Household already exists — just revalidate (don't create duplicate)
    revalidatePath(revalidate);
    return;
  }

  const { error } = await sb.from("households").insert({
    tenant_id: tenant.id,
    location_id: loc.id,
    name: name ?? address,
  });

  if (error) throw new Error(error.message);
  revalidatePath(revalidate);
}

/**
 * Create a location record, guarded against duplicates.
 * Returns an error string if location already exists.
 */
export async function createLocationAction(
  revalidate: string,
  formData: FormData
): Promise<{ error?: string; existingId?: string }> {
  const sb = getServerSupabaseWritable();
  const tenant = await getTenant();

  const address = String(formData.get("address_line1") ?? "").trim();
  const city    = String(formData.get("city")         ?? "").trim() || undefined;
  const state   = String(formData.get("state")        ?? "").trim() || undefined;
  const zip     = String(formData.get("postal_code")  ?? "").trim() || undefined;

  if (!address) return { error: "Address is required" };

  const result = await findOrCreateLocation(sb as any, tenant.id, {
    address_line1: address, city, state, postal_code: zip,
  });

  if (!result.created) {
    return { error: "Location already exists", existingId: result.id };
  }

  revalidatePath(revalidate);
  return {};
}

/**
 * Update the contact_types array on tenant_people for a specific person.
 */
export async function updateContactTypesAction(
  personId: string,
  contactTypes: string[],
  revalidate: string
) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { error } = await sb
    .from("tenant_people")
    .update({ contact_types: contactTypes })
    .eq("person_id", personId)
    .eq("tenant_id", tenant.id);

  if (error) throw error;
  revalidatePath(revalidate);
}

export async function deleteRowAction(
  table: keyof typeof EDITABLE_FIELDS,
  revalidate: string,
  formData: FormData
) {
  const id = getRowId(formData);
  const sb = getServerSupabaseWritable();
  const tenant = await getTenant();

  const { error } = await sb
    .from(table)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .limit(1);

  if (error) throw error;
  revalidatePath(revalidate);
}
