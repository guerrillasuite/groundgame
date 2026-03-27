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

  const allPeople: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from("people").select("id, first_name, last_name, email, phone")
      .eq("tenant_id", tenantId).neq("active", false).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allPeople.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  if (allPeople.length === 0) return NextResponse.json({ deactivated: 0 });

  const blanks = allPeople.filter((p) =>
    !p.first_name?.trim() && !p.last_name?.trim() &&
    !p.email?.trim() && !p.phone?.trim()
  );

  if (blanks.length === 0) return NextResponse.json({ deactivated: 0 });

  const ids = blanks.map((p) => p.id);
  const { error } = await sb
    .from("people")
    .update({ active: false })
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deactivated: blanks.length });
}
