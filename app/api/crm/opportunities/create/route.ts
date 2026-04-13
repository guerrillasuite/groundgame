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

export async function POST(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const pipeline = body.pipeline || body.contact_type || null;

  // Resolve default stage if not provided
  let stage = body.stage ?? null;
  if (!stage) {
    let stageQuery = sb
      .from("opportunity_stages")
      .select("key")
      .eq("tenant_id", tenantId)
      .order("order_index", { ascending: true })
      .limit(1);

    if (pipeline) {
      stageQuery = stageQuery.eq("contact_type_key", pipeline);
    } else {
      stageQuery = stageQuery.is("contact_type_key", null);
    }

    const { data: firstStage } = await stageQuery.maybeSingle();
    stage = (firstStage as any)?.key ?? "new";
  }

  const { data, error } = await sb
    .from("opportunities")
    .insert({
      tenant_id: tenantId,
      title: body.title.trim(),
      stage,
      pipeline,
      priority: body.priority || null,
      source: body.source || null,
      amount_cents: typeof body.amount_cents === "number" ? body.amount_cents : null,
      due_at: body.due_at || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create opportunity" }, { status: 500 });
  }

  return NextResponse.json({ id: (data as any).id, created: true });
}
