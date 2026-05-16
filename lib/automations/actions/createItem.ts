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

  // Resolve location fields (support template strings in static values)
  const location: string | null = config.location
    ? resolveTemplate(String(resolveField(config.location, payload) ?? ""), vars) || null
    : null;
  const locationAddress: string | null = config.location_address
    ? resolveTemplate(String(resolveField(config.location_address, payload) ?? ""), vars) || null
    : null;

  const itemId = randomUUID();
  const itemType: string = config.item_type ?? "task";
  const isTask = itemType === "task";

  // For non-task items (rides, events, meetings), start_at holds the datetime; due_date is task-only
  const resolvedDueValue: string | null = resolveField(config.due_date, payload) ?? null;
  const startAt: string | null = !isTask ? resolvedDueValue : null;
  const dueDateOnly: string | null = isTask && resolvedDueValue
    ? resolvedDueValue.split("T")[0]
    : null;

  // created_by must be non-null; fall back to first active tenant user for system-triggered automations
  let createdBy: string | null = assigneeIds[0] ?? null;
  if (!createdBy && tenantId) {
    const { data: fallbackUser } = await adminSb
      .from("user_tenants")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    createdBy = (fallbackUser as any)?.user_id ?? null;
  }

  // Process field_mappings — each { target, mode: "var"|"template", value }
  const mappedFields: Record<string, string | null> = {};
  const mappedCustomFields: Record<string, string> = {};
  for (const m of (config.field_mappings ?? []) as { target: string; mode: string; value: string }[]) {
    if (!m.target) continue;
    let resolved: string | null = null;
    if (m.mode === "var") {
      resolved = vars[m.value] ?? null;
    } else if (m.mode === "template") {
      resolved = resolveTemplate(m.value ?? "", vars) || null;
    }
    if (resolved !== null) {
      if (m.target.startsWith("custom_fields.")) {
        mappedCustomFields[m.target.slice("custom_fields.".length)] = resolved;
      } else {
        mappedFields[m.target] = resolved;
      }
    }
  }

  const { error } = await adminSb.from("sitrep_items").insert({
    id:            itemId,
    tenant_id:     tenantId,
    squad_id:      squadId,
    item_type:     itemType,
    title:         (mappedFields.title ?? title).trim(),
    description:   mappedFields.description ?? description,
    status:        "open",
    priority:      isTask ? priority : null,
    due_date:      dueDateOnly,
    start_at:      startAt,
    location:      mappedFields.location ?? location,
    visibility,
    depth:         0,
    created_by:    createdBy,
    custom_fields: Object.keys(mappedCustomFields).length > 0 ? mappedCustomFields : {},
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
