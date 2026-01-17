"use server";

import { updateRowAction } from "../_shared/mutations";

export async function updateLocationBound(formData: FormData) {
  return updateRowAction("locations", "/crm/lists", formData);
}
