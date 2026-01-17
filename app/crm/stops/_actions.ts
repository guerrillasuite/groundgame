"use server";

import { updateRowAction } from "../_shared/mutations";

export async function updateLocationBound(formData: FormData) {
  return updateRowAction("locations", "/crm/stops", formData);
}
