import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { id: tenantId } = await getTenant();

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );

  const { data } = await sb
    .from("walklists")
    .select("survey_id, call_capture_mode")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return NextResponse.json({
    survey_id: data?.survey_id ?? null,
    call_capture_mode: data?.call_capture_mode ?? null,
  });
}
