import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminIdentity } from "@/lib/adminAuth";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const identity = await getAdminIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = identity.isSuperAdmin || identity.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const personIds: string[] = body.personIds ?? [];
  const companyIds: string[] = body.companyIds ?? [];
  const requestedTenantId: string | undefined = body.tenant_id;

  if (!personIds.length && !companyIds.length) {
    return NextResponse.json({ created: 0 });
  }

  // Resolve tenant
  let tenantId: string;
  if (requestedTenantId) {
    tenantId = requestedTenantId;
  } else {
    try {
      const urlTenant = await getTenant();
      tenantId = urlTenant.id;
    } catch {
      return NextResponse.json({ error: "No tenant resolved" }, { status: 400 });
    }
  }

  const sb = makeSb(tenantId);

  // ── Fetch first stage ─────────────────────────────────────────────────────
  const { data: stageRow } = await sb
    .from("opportunity_stages")
    .select("key")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstStageKey = stageRow?.key ?? "new";

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];

  // ── Build rows for people ─────────────────────────────────────────────────
  if (personIds.length > 0) {
    const uniqueIds = [...new Set(personIds)];
    const personMap = new Map<string, string>(); // id → full name

    for (const idChunk of chunk(uniqueIds, 200)) {
      const { data } = await sb
        .from("people")
        .select("id, first_name, last_name")
        .in("id", idChunk);
      for (const p of data ?? []) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "(Unnamed)";
        personMap.set(p.id, name);
      }
    }

    for (const personId of uniqueIds) {
      rows.push({
        tenant_id: tenantId,
        title: personMap.get(personId) ?? "(Unnamed)",
        stage: firstStageKey,
        contact_person_id: personId,
        custom: {},
        created_at: now,
      });
    }
  }

  // ── Build rows for companies ──────────────────────────────────────────────
  if (companyIds.length > 0) {
    const uniqueIds = [...new Set(companyIds)];
    const companyMap = new Map<string, string>(); // id → name

    for (const idChunk of chunk(uniqueIds, 200)) {
      const { data } = await sb
        .from("companies")
        .select("id, name")
        .in("id", idChunk);
      for (const c of data ?? []) {
        if (c.name) companyMap.set(c.id, c.name);
      }
    }

    for (const companyId of uniqueIds) {
      rows.push({
        tenant_id: tenantId,
        title: companyMap.get(companyId) ?? "(Unnamed)",
        stage: firstStageKey,
        customer_company_id: companyId,
        custom: {},
        created_at: now,
      });
    }
  }

  // ── Insert in chunks of 500 ───────────────────────────────────────────────
  let created = 0;
  const errors: string[] = [];

  for (const rowChunk of chunk(rows, 500)) {
    const { error } = await sb.from("opportunities").insert(rowChunk);
    if (error) {
      errors.push(error.message);
    } else {
      created += rowChunk.length;
    }
  }

  if (errors.length > 0 && created === 0) {
    return NextResponse.json({ error: errors[0] }, { status: 500 });
  }

  return NextResponse.json({ created, errors: errors.length > 0 ? errors : undefined });
}
