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

const UPPERCASE_SUFFIXES = new Set(["II", "III", "IV", "V", "VI", "JR", "SR"]);

function titleCaseName(raw: string): string {
  return raw
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-") return part;
      const upper = part.toUpperCase();
      if (UPPERCASE_SUFFIXES.has(upper)) return upper;
      const lower = part.toLowerCase();
      if (/^o'/i.test(lower)) return "O'" + lower.slice(2).charAt(0).toUpperCase() + lower.slice(3);
      if (/^mc/i.test(lower) && lower.length > 2) return "Mc" + lower.slice(2).charAt(0).toUpperCase() + lower.slice(3);
      if (/^mac/i.test(lower) && lower.length > 3 && /[A-Z]/.test(part[3] ?? "")) {
        return "Mac" + lower.slice(3).charAt(0).toUpperCase() + lower.slice(4);
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function needsCapFix(name: string | null): boolean {
  if (!name || name.trim().length < 2) return false;
  return /^[A-Z]{2,}$/.test(name.trim());
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

  const people = await fetchAll<{ id: string; first_name: string | null; last_name: string | null }>((offset) =>
    sb.from("people").select("id, first_name, last_name").eq("tenant_id", tenantId).range(offset, offset + 999)
  );

  if (people.length === 0) return NextResponse.json({ updated: 0 });

  // Build patches only for rows where the conversion produces a genuinely different value
  const toUpdate: Array<{ id: string; first_name?: string; last_name?: string }> = [];

  for (const p of people) {
    const patch: { id: string; first_name?: string; last_name?: string } = { id: p.id };

    if (needsCapFix(p.first_name)) {
      const fixed = titleCaseName(p.first_name!);
      if (fixed !== p.first_name) patch.first_name = fixed;
    }
    if (needsCapFix(p.last_name)) {
      const fixed = titleCaseName(p.last_name!);
      if (fixed !== p.last_name) patch.last_name = fixed;
    }

    // Only queue if at least one field actually changed
    if (patch.first_name !== undefined || patch.last_name !== undefined) {
      toUpdate.push(patch);
    }
  }

  if (toUpdate.length === 0) return NextResponse.json({ updated: 0 });

  // Use update (not upsert) — safer for partial-field patches
  let updated = 0;
  for (const row of toUpdate) {
    const { id, ...fields } = row;
    const { error } = await sb
      .from("people")
      .update(fields)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (!error) updated++;
  }

  return NextResponse.json({ updated });
}
