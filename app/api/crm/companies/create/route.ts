import { NextRequest, NextResponse } from "next/server";
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

const ALLOWED = ["name", "domain", "phone", "email", "industry", "status", "presence"] as const;

export async function POST(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const payload: Record<string, string> = { tenant_id: tenantId };
  for (const k of ALLOWED) {
    if (body[k]) payload[k] = String(body[k]).trim();
  }

  const { data, error } = await sb.from("companies").insert(payload).select("id").single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create company" }, { status: 500 });
  }

  // Link to tenant
  await sb.from("tenant_companies").upsert(
    { tenant_id: tenantId, company_id: (data as any).id, linked_at: new Date().toISOString() },
    { onConflict: "tenant_id,company_id", ignoreDuplicates: true }
  );

  return NextResponse.json({ id: (data as any).id, created: true });
}
