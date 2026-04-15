import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: Promise<{ id: string }> };

/** Check verification status with Resend and update DB if verified */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: domainId } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { data: row } = await sb
    .from("email_sending_domains")
    .select("id, resend_domain_id, verified")
    .eq("id", domainId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.verified) return NextResponse.json({ verified: true });
  if (!row.resend_domain_id) return NextResponse.json({ verified: false });

  const resend = new Resend(process.env.RESEND_DISPATCH_API_KEY);

  try {
    const result = await resend.domains.get(row.resend_domain_id);
    const isVerified = result.data?.status === "verified";

    if (isVerified) {
      await sb
        .from("email_sending_domains")
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq("id", domainId)
        .eq("tenant_id", tenant.id);
    }

    return NextResponse.json({ verified: isVerified });
  } catch {
    return NextResponse.json({ verified: false });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: domainId } = await params;
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = makeSb(tenant.id);
  const { data: row } = await sb
    .from("email_sending_domains")
    .select("id, resend_domain_id")
    .eq("id", domainId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove from Resend too (best effort)
  if (row.resend_domain_id) {
    try {
      const resend = new Resend(process.env.RESEND_DISPATCH_API_KEY);
      await resend.domains.remove(row.resend_domain_id);
    } catch {
      // Non-fatal — still remove from DB
    }
  }

  const { error } = await sb
    .from("email_sending_domains")
    .delete()
    .eq("id", domainId)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
