"use server";

import { updateRowAction } from "../_shared/mutations";

export async function updatePersonBound(formData: FormData) {
  // table, revalidatePath, payload
  return updateRowAction("people", "/crm/people", formData);
}
