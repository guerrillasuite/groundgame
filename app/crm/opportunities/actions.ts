"use server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function updateOpportunityStage(opportunityId: string, newStage: string) {
  const tenant = await getTenant();
  const sb = getServerSupabase();

  // TODO: replace with your RPC or update statement w/ RLS
  const { error } = await sb
    .from("opportunities")
    .update({ stage: newStage, updated_at: new Date().toISOString() })
    .eq("id", opportunityId)
    .eq("tenant_id", tenant.id);

  if (error) throw new Error(error.message);
  revalidatePath("/crm/opportunities");
}

export async function updateOpportunityField(id: string, patch: Record<string, any>) {
  const tenant = await getTenant();
  const sb = getServerSupabase();

  const { error } = await sb
    .from("opportunities")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) throw new Error(error.message);
  revalidatePath("/crm/opportunities");
}

