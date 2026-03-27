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

export async function POST() {
  const tenant = await getTenant();
  const tenantId = tenant.id;
  const sb = makeSb(tenantId);

  const people = await (async () => {
    const results: { id: string; email: string | null }[] = [];
    let offset = 0;
    while (true) {
      const { data } = await sb.from("people").select("id, email").eq("tenant_id", tenantId)
        .not("email", "is", null).neq("email", "").range(offset, offset + 999);
      if (!data || data.length === 0) break;
      results.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    return results;
  })();

  if (people.length === 0) return NextResponse.json({ updated: 0 });

  const toUpdate = people
    .filter((p) => p.email && p.email !== p.email.toLowerCase().trim())
    .map((p) => ({ id: p.id, email: p.email!.toLowerCase().trim() }));

  if (toUpdate.length === 0) return NextResponse.json({ updated: 0 });

  let updated = 0;
  const chunkSize = 200;
  for (let i = 0; i < toUpdate.length; i += chunkSize) {
    const chunk = toUpdate.slice(i, i + chunkSize);
    const { error } = await sb.from("people").upsert(chunk, { onConflict: "id" });
    if (!error) updated += chunk.length;
  }

  return NextResponse.json({ updated });
}
