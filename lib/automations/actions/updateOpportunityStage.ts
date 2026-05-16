import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedPayload } from "../triggerPayload";

export async function actionUpdateOpportunityStage(
  config: Record<string, any>,
  payload: NormalizedPayload,
  adminSb: SupabaseClient<any>,
): Promise<void> {
  const oppId = payload.opportunity?.id;
  if (!oppId) throw new Error("update_opportunity_stage requires a triggering opportunity");

  const toStage = config.to_stage as string;
  if (!toStage) throw new Error("update_opportunity_stage: to_stage is required");

  const { error } = await adminSb
    .from("opportunities")
    .update({ stage: toStage, updated_at: new Date().toISOString() })
    .eq("id", oppId);

  if (error) throw new Error(`updateOpportunityStage failed: ${error.message}`);
}
