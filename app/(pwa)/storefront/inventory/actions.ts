"use server";

import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function saveInventory(changes: { product_id: string; on_hand: number }[]) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();
  const { error } = await sb.rpc("gg_update_inventory_bulk_v1", {
    p_tenant_id: tenantId,
    p_changes: changes,
  });
  if (error) throw error;
}
