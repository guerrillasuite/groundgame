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

/** Returns IDs of locations not linked to any household OR company for this tenant. */
async function getOrphanedIds(sb: ReturnType<typeof makeSb>, tenantId: string): Promise<string[]> {
  const usedLocIds = new Set<string>();

  // Household location_ids for this tenant
  const { data: households } = await sb
    .from("households")
    .select("location_id")
    .eq("tenant_id", tenantId)
    .not("location_id", "is", null);

  for (const h of households ?? []) {
    if (h.location_id) usedLocIds.add(h.location_id);
  }

  // Company location_ids — scoped to this tenant via tenant_companies
  const { data: tenantCompanies } = await sb
    .from("tenant_companies")
    .select("company_id")
    .eq("tenant_id", tenantId);

  const companyIds = (tenantCompanies ?? []).map((tc) => tc.company_id as string).filter(Boolean);

  if (companyIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < companyIds.length; i += chunkSize) {
      const chunk = companyIds.slice(i, i + chunkSize);
      const { data: companies } = await sb
        .from("companies")
        .select("location_id")
        .in("id", chunk)
        .not("location_id", "is", null);
      for (const c of companies ?? []) {
        if (c.location_id) usedLocIds.add(c.location_id);
      }
    }
  }

  // All location IDs in the system
  const { data: allLocs } = await sb.from("locations").select("id");
  return (allLocs ?? []).map((l) => l.id).filter((id) => !usedLocIds.has(id));
}

export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const orphanIds = await getOrphanedIds(sb, tenant.id);

  if (orphanIds.length === 0) return NextResponse.json({ count: 0, sample: [] });

  const sampleIds = orphanIds.slice(0, 5);
  const { data: sample } = await sb
    .from("locations")
    .select("id, address_line1, city, state")
    .in("id", sampleIds);

  return NextResponse.json({ count: orphanIds.length, sample: sample ?? [] });
}

export async function DELETE() {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const orphanIds = await getOrphanedIds(sb, tenant.id);

  if (orphanIds.length === 0) return NextResponse.json({ deleted: 0 });

  let deleted = 0;
  const chunkSize = 200;
  for (let i = 0; i < orphanIds.length; i += chunkSize) {
    const chunk = orphanIds.slice(i, i + chunkSize);
    const { error } = await sb.from("locations").delete().in("id", chunk);
    if (!error) deleted += chunk.length;
  }

  return NextResponse.json({ deleted });
}
