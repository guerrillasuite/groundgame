import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/** Normalize a phone number to (XXX) XXX-XXXX or null if invalid. */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

async function fetchAll<T>(queryFn: (offset: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset);
    if (error || !data || data.length === 0) break;
    results.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return results;
}

export async function POST() {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const tenantId = tenant.id;
  const sb = makeSb(tenantId);

  const people = await fetchAll<{ id: string; phone: string | null; phone_cell: string | null; phone_landline: string | null }>((offset) =>
    sb.from("people")
      .select("id, phone, phone_cell, phone_landline")
      .eq("tenant_id", tenantId)
      .or("phone.not.is.null,phone_cell.not.is.null,phone_landline.not.is.null")
      .range(offset, offset + 999)
  );

  if (people.length === 0) return NextResponse.json({ updated: 0, cleared: 0 });

  const updates: { id: string; phone?: string | null; phone_cell?: string | null; phone_landline?: string | null }[] = [];
  let cleared = 0;

  for (const p of people) {
    const patch: Record<string, string | null> = {};

    if (p.phone) {
      const normalized = normalizePhone(p.phone);
      if (normalized !== p.phone) {
        patch.phone = normalized;
        if (normalized === null) cleared++;
      }
    }
    if (p.phone_cell) {
      const normalized = normalizePhone(p.phone_cell);
      if (normalized !== p.phone_cell) {
        patch.phone_cell = normalized;
        if (normalized === null) cleared++;
      }
    }
    if (p.phone_landline) {
      const normalized = normalizePhone(p.phone_landline);
      if (normalized !== p.phone_landline) {
        patch.phone_landline = normalized;
        if (normalized === null) cleared++;
      }
    }

    if (Object.keys(patch).length > 0) updates.push({ id: p.id, ...patch });
  }

  if (updates.length === 0) return NextResponse.json({ updated: 0, cleared: 0 });

  let updated = 0;
  const chunkSize = 200;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const { error } = await sb.from("people").upsert(chunk, { onConflict: "id" });
    if (!error) updated += chunk.length;
  }

  return NextResponse.json({ updated, cleared });
}
