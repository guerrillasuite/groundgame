"use server";

import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

/**
 * Update opportunity + contact + delivery info.
 * Accepts a minimal "form" shape from the editor.
 */
export async function updateOrder(
  orderId: string,
  form: {
    title?: string | null;
    notes?: string | null;
    contact?: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };
    delivery?: { address_line1?: string | null; unit?: string | null; city?: string | null; state?: string | null; postal_code?: string | null };
  }
) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  // 1) Upsert contact person if data provided
  let contact_person_id: string | null | undefined = undefined;
  if (form.contact) {
    const { first_name, last_name, email, phone } = form.contact;
    if (email || phone || first_name || last_name) {
      // find by email first (simple dedupe)
      let personId: string | null = null;

      if (email) {
        const { data: existing, error: e1 } = await sb
          .from("people")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("email", email)
          .maybeSingle();
        if (e1) throw e1;
        if (existing) personId = existing.id;
      }

      if (!personId) {
        const { data: created, error: e2 } = await sb
          .from("people")
          .insert({
            tenant_id: tenantId,
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            email: email ?? null,
            phone: phone ?? null,
          })
          .select("id")
          .single();
        if (e2) throw e2;
        personId = created.id;
      } else {
        const { error: e3 } = await sb
          .from("people")
          .update({ first_name: first_name ?? null, last_name: last_name ?? null, phone: phone ?? null })
          .eq("tenant_id", tenantId)
          .eq("id", personId);
        if (e3) throw e3;
      }

      contact_person_id = personId;
    }
  }

  // 2) Upsert delivery location + link
  if (form.delivery?.address_line1) {
    const { data: loc, error: le } = await sb
      .from("locations")
      .insert({
        tenant_id: tenantId,
        address_line1: form.delivery.address_line1,
        unit: form.delivery.unit ?? null,
        city: form.delivery.city ?? null,
        state: form.delivery.state ?? null,
        postal_code: form.delivery.postal_code ?? null,
      })
      .select("id")
      .single();
    if (le) throw le;

    const { error: linkErr } = await sb
      .from("opportunity_locations")
      .upsert(
        {
          tenant_id: tenantId,
          opportunity_id: orderId,
          location_id: loc.id,
          role: "delivery",
          is_primary: true,
        },
        { onConflict: "tenant_id,opportunity_id,role" }
      );
    if (linkErr) throw linkErr;
  }

  // 3) Update opportunity itself
  const updates: Record<string, any> = {};
  if (form.title !== undefined) updates.title = form.title;
  if (form.notes !== undefined) updates.notes = form.notes;
  if (contact_person_id !== undefined) updates.contact_person_id = contact_person_id;

  if (Object.keys(updates).length > 0) {
    const { error: oErr } = await sb
      .from("opportunities")
      .update(updates)
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .select("id")
      .single();
    if (oErr) throw oErr;
  }

  revalidatePath(`/storefront/orders/${orderId}`);
}

/** Add item to an order */
export async function addOrderItem(orderId: string, productId: string, qty: number) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { error } = await sb
    .from("order_items")
    .insert({
      tenant_id: tenantId,
      opportunity_id: orderId,
      product_id: productId,
      quantity: Math.max(1, Number(qty || 1)),
    });
  if (error) throw error;

  revalidatePath(`/storefront/orders/${orderId}`);
}

/** Update an item's quantity */
export async function updateOrderItem(itemId: string, qty: number) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { error } = await sb
    .from("order_items")
    .update({ quantity: Math.max(1, Number(qty || 1)) })
    .eq("tenant_id", tenantId)
    .eq("id", itemId);
  if (error) throw error;

  // We can't know orderId cheaply; revalidate the detail path upstream if needed
}

/** Remove an item from an order */
export async function removeOrderItem(itemId: string) {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { error } = await sb.from("order_items").delete().eq("tenant_id", tenantId).eq("id", itemId);
  if (error) throw error;
}
