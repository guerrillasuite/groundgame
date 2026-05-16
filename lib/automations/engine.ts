import { createClient } from "@supabase/supabase-js";
import { evaluateConditions } from "./conditions";
import { matchesTriggerConfig, buildNormalizedPayload } from "./triggerPayload";
import type { TriggerPayload } from "./triggerPayload";
import { actionSendEmail }             from "./actions/sendEmail";
import { actionCreateItem }            from "./actions/createItem";
import { actionUpdateItem }            from "./actions/updateItem";
import { actionCreateReminder }        from "./actions/createReminder";
import { actionUpdateOpportunityStage } from "./actions/updateOpportunityStage";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function logRun(
  adminSb: ReturnType<typeof makeAdminSb>,
  automationId: string,
  payload: TriggerPayload,
  status: "success" | "error" | "skipped",
  errorMsg?: string,
) {
  await adminSb.from("sitrep_automation_runs").insert({
    automation_id: automationId,
    item_id:       payload.item?.id ?? null,
    record_id:     payload.opportunity?.id ?? payload.person?.id ?? null,
    trigger_data:  {
      trigger_type: payload.trigger_type,
      item_id:       payload.item?.id,
      opportunity_id: payload.opportunity?.id,
      person_id:      payload.person?.id,
    },
    status,
    error_msg: errorMsg ?? null,
  }).then(() => {}, () => {});
}

/** Fire all matching automations for a given trigger event. Never throws. */
export async function fireAutomations(payload: TriggerPayload): Promise<void> {
  try {
    const adminSb = makeAdminSb();

    const { data: automations } = await adminSb
      .from("sitrep_automations")
      .select("*")
      .eq("tenant_id", payload.tenant_id)
      .eq("trigger_type", payload.trigger_type)
      .eq("is_active", true);

    for (const auto of automations ?? []) {
      try {
        // 1. Trigger config constraints (from_status, to_status, item_type, etc.)
        if (!matchesTriggerConfig(auto.trigger_config ?? {}, payload)) {
          await logRun(adminSb, auto.id, payload, "skipped");
          continue;
        }

        // 2. Condition evaluation
        const record =
          payload.item ?? payload.opportunity ?? payload.person ?? {};
        if (!evaluateConditions(auto.conditions ?? [], record)) {
          await logRun(adminSb, auto.id, payload, "skipped");
          continue;
        }

        // 3. Build normalized payload with resolved {{vars}}
        const normalized = await buildNormalizedPayload(payload, adminSb);

        // 4. Dispatch action
        switch (auto.action_type) {
          case "send_email":
            await actionSendEmail(auto.action_config, normalized, adminSb);
            break;
          case "create_sitrep_item":
            await actionCreateItem(auto.action_config, normalized, adminSb);
            break;
          case "update_sitrep_item":
            await actionUpdateItem(auto.action_config, normalized, adminSb);
            break;
          case "create_reminder":
            await actionCreateReminder(auto.action_config, normalized, adminSb);
            break;
          case "update_opportunity_stage":
            await actionUpdateOpportunityStage(auto.action_config, normalized, adminSb);
            break;
          default:
            throw new Error(`Unknown action_type: ${auto.action_type}`);
        }

        // 5. Log success + update stats
        await logRun(adminSb, auto.id, payload, "success");
        await adminSb
          .from("sitrep_automations")
          .update({
            run_count:   (auto.run_count ?? 0) + 1,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", auto.id)
          .then(() => {}, () => {});

      } catch (e: any) {
        await logRun(adminSb, auto.id, payload, "error", e?.message ?? String(e));
      }
    }
  } catch {
    // outer guard — automation errors must never affect the caller
  }
}

export { makeAdminSb };
