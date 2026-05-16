import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveField, resolveTemplate } from "../fieldMap";
import type { NormalizedPayload } from "../triggerPayload";

export async function actionCreateReminder(
  config: Record<string, any>,
  payload: NormalizedPayload,
  adminSb: SupabaseClient<any>,
): Promise<void> {
  const vars  = payload.vars ?? {};
  const title = resolveTemplate(config.title_template ?? "Reminder: {{title}}", vars);
  const notes = config.notes_template ? resolveTemplate(config.notes_template, vars) : null;

  // Resolve due date
  const dueDate: string | null = resolveField(config.due, payload) ?? null;
  const dueAt = dueDate ? `${dueDate}T09:00:00Z` : new Date(Date.now() + 86400_000).toISOString();

  // Resolve assignee
  let assignedUserId: string | null = null;
  if (config.assign_to?.mode === "creator") {
    assignedUserId = payload.item?.created_by ?? payload.opportunity?.created_by ?? null;
  } else if (config.assign_to?.mode === "specific" && config.assign_to.user_id) {
    assignedUserId = config.assign_to.user_id;
  }

  const { error } = await adminSb.from("reminders").insert({
    tenant_id:           payload.tenant_id,
    type:                "custom",
    title,
    notes,
    due_at:              dueAt,
    status:              "pending",
    assigned_to_user_id: assignedUserId,
    opportunity_id:      payload.opportunity?.id ?? null,
    person_id:           payload.person?.id ?? null,
  });

  if (error) throw new Error(`createReminder failed: ${error.message}`);
}
