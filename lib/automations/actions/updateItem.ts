import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveField } from "../fieldMap";
import type { NormalizedPayload } from "../triggerPayload";

export async function actionUpdateItem(
  config: Record<string, any>,
  payload: NormalizedPayload,
  adminSb: SupabaseClient<any>,
): Promise<void> {
  const itemId = payload.item?.id;
  if (!itemId) throw new Error("update_sitrep_item requires a triggering item");

  const field = config.field as string;
  const value = resolveField(config.value, payload);

  if (!field) throw new Error("update_sitrep_item: field is required");

  const allowed = ["status", "priority", "visibility", "due_date"];
  if (!allowed.includes(field)) throw new Error(`update_sitrep_item: field '${field}' not allowed`);

  const { error } = await adminSb
    .from("sitrep_items")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) throw new Error(`updateItem failed: ${error.message}`);
}
