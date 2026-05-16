import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveField, resolveTemplate } from "../fieldMap";
import type { NormalizedPayload } from "../triggerPayload";

export async function actionCreateItem(
  config: Record<string, any>,
  payload: NormalizedPayload,
  adminSb: SupabaseClient<any>,
): Promise<void> {
  const vars = payload.vars ?? {};

  // Resolve title
  let title: string;
  if (config.title?.mode === "field" && config.title.prefix) {
    const raw = payload.item?.[config.title.field] ?? payload.opportunity?.[config.title.field] ?? "";
    title = `${config.title.prefix}${raw}`;
  } else if (config.title?.mode === "field") {
    title = String(payload.item?.[config.title.field] ?? payload.opportunity?.[config.title.field] ?? "Untitled");
  } else if (config.title?.mode === "static") {
    title = resolveTemplate(config.title.value ?? "Untitled", vars);
  } else if (typeof config.title === "string") {
    title = resolveTemplate(config.title, vars);
  } else {
    title = resolveTemplate("{{title}}", vars) || "Untitled";
  }

  // Resolve squad_id
  const squadId: string | null = resolveField(config.squad_id, payload) ?? null;

  // Resolve tenant_id
  const tenantId: string | null = resolveField(config.tenant_id, payload) ?? payload.tenant_id ?? null;

  // Resolve due_date
  const dueDate: string | null = resolveField(config.due_date, payload) ?? null;

  // Resolve priority
  const priority: string = resolveField(config.priority, payload) ?? "normal";

  // Resolve visibility
  const visibility: string = resolveField(config.visibility, payload) ?? "assignee_only";

  // Resolve description
  let description: string | null = null;
  if (config.description) {
    const raw = resolveField(config.description, payload);
    description = raw ? resolveTemplate(String(raw), vars) : null;
  }

  // Resolve assignees
  let assigneeIds: string[] = [];
  const assignTo = config.assign_to;
  if (assignTo?.mode === "creator") {
    const creatorId = payload.item?.created_by ?? null;
    if (creatorId) assigneeIds = [creatorId];
  } else if (assignTo?.mode === "assignees") {
    assigneeIds = (payload.item?.sitrep_assignments ?? []).map((a: any) => a.user_id as string);
  } else if (assignTo?.mode === "specific" && assignTo.user_id) {
    assigneeIds = [assignTo.user_id];
  }

  const itemId = randomUUID();
  const itemType: string = config.item_type ?? "task";

  const { error } = await adminSb.from("sitrep_items").insert({
    id:           itemId,
    tenant_id:    tenantId,
    squad_id:     squadId,
    item_type:    itemType,
    title:        title.trim(),
    description,
    status:       "open",
    priority:     itemType === "task" ? priority : null,
    due_date:     dueDate,
    visibility,
    depth:        0,
    created_by:   assigneeIds[0] ?? null,
  });

  if (error) throw new Error(`createItem insert failed: ${error.message}`);

  // Insert assignments
  if (assigneeIds.length > 0) {
    await adminSb.from("sitrep_assignments").insert(
      assigneeIds.map((uid) => ({
        item_id: itemId,
        user_id: uid,
        role:    itemType === "meeting" ? "participant" : itemType === "event" ? "attendee" : "assignee",
      })),
    ).then(() => {}, () => {});
  }
}
