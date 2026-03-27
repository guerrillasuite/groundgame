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

export async function GET() {
  const tenant = await getTenant();
  const tenantId = tenant.id;
  const sb = makeSb(tenantId);

  const { data: people } = await sb
    .from("people")
    .select("id, first_name, last_name, length_of_residence, moved_from_state")
    .eq("tenant_id", tenantId)
    .or("moved_from_state.not.is.null,length_of_residence.not.is.null");

  const movers = (people ?? []).filter((p) =>
    (p.moved_from_state?.trim()) ||
    (p.length_of_residence !== null && p.length_of_residence <= 12)
  );

  const sample = movers.slice(0, 5).map((p) => ({
    id: p.id,
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    length_of_residence: p.length_of_residence,
    moved_from_state: p.moved_from_state,
  }));

  return NextResponse.json({ count: movers.length, sample });
}
