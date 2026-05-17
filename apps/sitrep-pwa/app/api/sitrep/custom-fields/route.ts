import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/sitrep/custom-fields?tenantId=xxx[&itemTypeId=uuid][&scope=snapshot|detail]
// Returns custom field definitions for sitrep_items, optionally filtered by type and display scope
export async function GET(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url        = new URL(req.url);
  const tenantId   = url.searchParams.get("tenantId") ?? "";
  const itemTypeId = url.searchParams.get("itemTypeId") ?? "";
  const scope      = url.searchParams.get("scope") ?? "";

  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const sb = makeAdminSb();

  let query = sb
    .from("custom_field_definitions")
    .select("field_key, label, field_type, options, sort_order, display_scope")
    .eq("tenant_id", tenantId)
    .eq("record_type", "sitrep_items")
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (itemTypeId) query = query.eq("sitrep_type_id", itemTypeId);
  if (scope && ["snapshot", "detail"].includes(scope)) query = query.eq("display_scope", scope);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
