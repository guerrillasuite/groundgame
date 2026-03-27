import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
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
  const tenant = await getTenant();
  const tenantId = tenant.id;
  const sb = makeSb(tenantId);

  const targets = await fetchAll<{ id: string; middle_name: string | null }>((offset) =>
    sb.from("people")
      .select("id, middle_name")
      .eq("tenant_id", tenantId)
      .not("middle_name", "is", null)
      .neq("middle_name", "")
      .or("middle_initial.is.null,middle_initial.eq.")
      .range(offset, offset + 999)
  );

  if (targets.length === 0) return NextResponse.json({ updated: 0 });

  const updates = targets.map((p) => ({
    id: p.id,
    middle_initial: p.middle_name!.trim().charAt(0).toUpperCase(),
  }));

  let updated = 0;
  const chunkSize = 200;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const { error } = await sb.from("people").upsert(chunk, { onConflict: "id" });
    if (!error) updated += chunk.length;
  }

  return NextResponse.json({ updated });
}
