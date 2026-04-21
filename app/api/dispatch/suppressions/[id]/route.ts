import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// DELETE /api/dispatch/suppressions/[id] — remove single entry
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasFeature(tenant.features, "crm_dispatch") && !user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { error } = await sb
    .from("email_unsubscribes")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
