// app/(pwa)/storefront/orders/actions.ts
"use server";

import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function moveOrderStage(orderId: string, newStage: string) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { error } = await sb
    .from("opportunities")
    .update({ stage: newStage })
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .select("id")
    .single();

  if (error) throw error;
}

export async function updateOrderInline(orderId: string, patch: { title?: string; notes?: string }) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  // Simple inline patch for fields that live on opportunities
  const updates: Record<string, any> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.notes !== undefined) updates.notes = patch.notes;

  if (Object.keys(updates).length === 0) return;

  const { error } = await sb
    .from("opportunities")
    .update(updates)
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .select("id")
    .single();

  if (error) throw error;
}
