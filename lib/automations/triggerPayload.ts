import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserEmail } from "./resolveUserEmail";

const APP_URL =
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://app.guerrillasuite.com";

export interface TriggerPayload {
  tenant_id:    string;
  trigger_type: string;
  item?:        Record<string, any> | null;
  opportunity?: Record<string, any> | null;
  person?:      Record<string, any> | null;
  old?:         Record<string, any> | null;  // previous field values for _changed triggers
}

export interface NormalizedPayload extends TriggerPayload {
  vars: Record<string, string>;
}

export async function buildNormalizedPayload(
  payload: TriggerPayload,
  adminSb: SupabaseClient<any>,
): Promise<NormalizedPayload> {
  const vars: Record<string, string> = {};

  if (payload.item) {
    const item = payload.item;
    vars.title        = item.title ?? "";
    vars.status       = item.status ?? "";
    vars.priority     = item.priority ?? "";
    vars.item_type    = item.item_type ?? "";
    vars.due_date     = item.due_date ?? item.start_at?.split("T")[0] ?? "";

    // Resolve squad name
    if (item.squad_id) {
      const { data: squad } = await adminSb.from("squads").select("name").eq("id", item.squad_id).single();
      vars.squad_name = (squad as any)?.name ?? "";
    } else {
      vars.squad_name = "";
    }

    // Resolve creator name
    if (item.created_by) {
      const u = await resolveUserEmail(item.created_by);
      vars.created_by = u?.name ?? "";
    }

    // Resolve assignee names
    const assignments: { user_id: string }[] = item.sitrep_assignments ?? [];
    if (assignments.length > 0) {
      const names = await Promise.all(
        assignments.map(async (a) => {
          const u = await resolveUserEmail(a.user_id);
          return u?.name ?? a.user_id;
        }),
      );
      vars.assignee_names = names.join(", ");
    } else {
      vars.assignee_names = "";
    }

    vars.link = `${APP_URL}/crm/sitrep/${item.id}`;
  }

  if (payload.opportunity) {
    const opp = payload.opportunity;
    vars.title     = opp.title ?? "";
    vars.stage     = opp.stage ?? "";
    vars.pipeline  = opp.pipeline ?? "";
    vars.priority  = opp.priority ?? "";
    vars.due_date  = opp.due_at?.split("T")[0] ?? opp.order_date ?? "";
    vars.link      = `${APP_URL}/crm/opportunities/${opp.id}`;

    // Resolve assigned users
    const { data: oppUsers } = await adminSb
      .from("opportunity_users")
      .select("user_id")
      .eq("opportunity_id", opp.id);
    if (oppUsers && oppUsers.length > 0) {
      const names = await Promise.all(
        (oppUsers as any[]).map(async (u) => {
          const user = await resolveUserEmail(u.user_id);
          return user?.name ?? u.user_id;
        }),
      );
      vars.assignee_names = names.join(", ");
    } else {
      vars.assignee_names = "";
    }
  }

  if (payload.person) {
    const p = payload.person;
    vars.title = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    vars.link  = `${APP_URL}/crm/people/${p.id}`;
  }

  // Resolve tenant name
  if (payload.tenant_id) {
    const { data: tenant } = await adminSb
      .from("tenants")
      .select("name")
      .eq("id", payload.tenant_id)
      .single();
    vars.tenant_name = (tenant as any)?.name ?? payload.tenant_id;
  }

  return { ...payload, vars };
}

/** Check trigger_config constraints (from_status/to_status, item_type filter, etc.) */
export function matchesTriggerConfig(
  triggerConfig: Record<string, any>,
  payload: TriggerPayload,
): boolean {
  const item = payload.item;
  const opp  = payload.opportunity;
  const old  = payload.old;

  if (!triggerConfig || Object.keys(triggerConfig).length === 0) return true;

  // item_type filter
  if (triggerConfig.item_type && item?.item_type !== triggerConfig.item_type) return false;

  // status_changed: from/to filters
  if (triggerConfig.from_status && old?.status !== triggerConfig.from_status) return false;
  if (triggerConfig.to_status   && item?.status !== triggerConfig.to_status)  return false;

  // priority filter
  if (triggerConfig.to_priority && item?.priority !== triggerConfig.to_priority) return false;

  // opportunity: stage filters
  if (triggerConfig.from_stage && old?.stage !== triggerConfig.from_stage) return false;
  if (triggerConfig.to_stage   && opp?.stage  !== triggerConfig.to_stage)  return false;

  // pipeline filter
  if (triggerConfig.pipeline) {
    const src = opp ?? item;
    if (src?.pipeline !== triggerConfig.pipeline) return false;
  }

  return true;
}
