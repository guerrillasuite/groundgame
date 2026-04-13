"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const REVALIDATE = (id?: string) => {
  revalidatePath("/crm/opportunities");
  if (id) revalidatePath(`/crm/opportunities/${id}`);
};

// ── Stage & field updates ──────────────────────────────────────────────────────

export async function updateOpportunityStage(opportunityId: string, newStage: string) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("opportunities")
    .update({ stage: newStage, updated_at: new Date().toISOString() })
    .eq("id", opportunityId)
    .eq("tenant_id", tenant.id);
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

const ALLOWED_FIELDS = [
  "title", "amount_cents", "description", "notes",
  "due_at", "priority", "source", "contact_person_id", "stage", "pipeline",
];

export async function updateOpportunityField(id: string, patch: Record<string, any>) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const safe: Record<string, any> = {};
  for (const k of ALLOWED_FIELDS) if (k in patch) safe[k] = patch[k];
  if (!Object.keys(safe).length) return;
  safe.updated_at = new Date().toISOString();
  const { error } = await sb
    .from("opportunities")
    .update(safe)
    .eq("id", id)
    .eq("tenant_id", tenant.id);
  if (error) throw new Error(error.message);
  REVALIDATE(id);
}

// ── People ─────────────────────────────────────────────────────────────────────

export async function addPersonToOpportunity(opportunityId: string, personId: string) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("opportunity_people")
    .upsert(
      { tenant_id: tenant.id, opportunity_id: opportunityId, person_id: personId, role: "contact", is_primary: false },
      { onConflict: "opportunity_id,person_id" }
    );
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

export async function removePersonFromOpportunity(opportunityId: string, personId: string) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("opportunity_people")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("opportunity_id", opportunityId)
    .eq("person_id", personId);
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

// ── Users ──────────────────────────────────────────────────────────────────────

export async function addUserToOpportunity(opportunityId: string, userId: string, role = "collaborator") {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("opportunity_users")
    .upsert(
      { tenant_id: tenant.id, opportunity_id: opportunityId, user_id: userId, role },
      { onConflict: "opportunity_id,user_id" }
    );
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

export async function removeUserFromOpportunity(opportunityId: string, userId: string) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("opportunity_users")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("opportunity_id", opportunityId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

// ── Order Items ────────────────────────────────────────────────────────────────

export async function addOpportunityItem(opportunityId: string, productId: string, quantity: number) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb.from("order_items").insert({
    tenant_id: tenant.id,
    opportunity_id: opportunityId,
    product_id: productId,
    quantity: Math.max(1, quantity),
  });
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

export async function updateOpportunityItemQty(itemId: string, opportunityId: string, quantity: number) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("order_items")
    .update({ quantity: Math.max(1, quantity) })
    .eq("tenant_id", tenant.id)
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}

export async function removeOpportunityItem(itemId: string, opportunityId: string) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("order_items")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  REVALIDATE(opportunityId);
}
