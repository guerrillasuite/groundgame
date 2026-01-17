"use server";

import { revalidatePath } from "next/cache";
import { getTenant } from "@/lib/tenant";
import { getServerSupabaseWritable } from "@/lib/supabase/server";

/**
 * Whitelist fields per table you want editable. This prevents arbitrary writes.
 * Add more tables/fields here as you expand.
 */
const EDITABLE_FIELDS: Record<string, readonly string[]> = {
  people: [
    "first_name", "last_name", "email", "phone",
    "notes", "household_id", "contact_type"
  ],
  locations: [
    "address_line1", "address_line2", "city", "state", "postal_code",
    "normalized_key", "notes"
  ],
  households: [
    "name", "location_id", "notes"
  ],
  opportunities: [
    "title", "amount_cents", "description", "contact_person_id",
    "stage", "order_index"
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
