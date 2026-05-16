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
    vars.notes     = "";
    vars.due_date  = opp.due_at?.split("T")[0] ?? opp.order_date ?? "";
    vars.due_at    = opp.due_at ?? "";
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

    // Fetch linked locations + custom_fields + primary person from DB
    if (opp.id) {
      const [locsRes, oppRes, personRes] = await Promise.all([
        adminSb
          .from("opportunity_locations")
          .select("role, locations(address_line1, city, state, postal_code, notes)")
          .eq("opportunity_id", opp.id),
        opp.custom_fields === undefined || opp.notes === undefined
          ? adminSb.from("opportunities").select("custom_fields, notes").eq("id", opp.id).maybeSingle()
          : Promise.resolve({ data: { custom_fields: opp.custom_fields, notes: opp.notes } }),
        adminSb
          .from("opportunity_people")
          .select("person_id, people(first_name, last_name, email, phone, phone_cell)")
          .eq("opportunity_id", opp.id)
          .eq("is_primary", true)
          .maybeSingle(),
      ]);
      for (const loc of (locsRes.data as any[]) ?? []) {
        const parts = [
          loc.locations?.address_line1,
          loc.locations?.city,
          loc.locations?.state,
          loc.locations?.postal_code,
        ].filter(Boolean);
        const addr = parts.join(", ");
        const name = loc.locations?.notes ?? addr;
        if (loc.role === "pickup") {
          vars.pickup_location = name;
          vars.pickup_address  = addr;
        } else if (loc.role === "dropoff") {
          vars.dropoff_location = name;
          vars.dropoff_address  = addr;
        }
      }
      const fetchedNotes = (oppRes.data as any)?.notes;
      if (fetchedNotes) vars.notes = fetchedNotes;

      const cf = (oppRes.data as any)?.custom_fields;
      if (cf && typeof cf === "object") {
        for (const [k, v] of Object.entries(cf)) {
          if (v != null) vars[`custom_fields.${k}`] = String(v);
        }
      }

      // Primary person on the opportunity
      const personRow = personRes.data as any;
      const person = personRow?.people;
      if (person) {
        const firstName = person.first_name ?? "";
        const lastName  = person.last_name ?? "";
        vars.person_first_name = firstName;
        vars.person_last_name  = lastName;
        vars.person_name       = `${firstName} ${lastName}`.trim();
        vars.person_email      = person.email ?? "";
        vars.person_phone      = person.phone_cell ?? person.phone ?? "";

        // Person custom fields from tenant_people.custom_data
        const personId = personRow?.person_id;
        if (personId) {
          const { data: tpRow } = await adminSb
            .from("tenant_people")
            .select("custom_data")
            .eq("person_id", personId)
            .eq("tenant_id", payload.tenant_id)
            .maybeSingle();
          const cd = (tpRow as any)?.custom_data;
          if (cd && typeof cd === "object") {
            for (const [k, v] of Object.entries(cd)) {
              if (v != null) vars[`custom_data.${k}`] = String(v);
            }
          }
        }
      }
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
