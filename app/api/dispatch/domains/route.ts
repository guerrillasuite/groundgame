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

export async function POST(req: NextRequest) {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const trimmed = domain.trim().toLowerCase();
  const resend = new Resend(process.env.RESEND_DISPATCH_API_KEY);

  // Register domain with Resend
  let resendDomainId: string | null = null;
  let dnsRecords: Array<{ type: string; name: string; value: string }> = [];

  try {
    const result = await resend.domains.create({ name: trimmed });
    if (result.data) {
      resendDomainId = result.data.id;
      dnsRecords = (result.data.records ?? []).map((r: any) => ({
        type: r.type,
        name: r.name,
        value: r.value,
      }));
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: `Resend domain registration failed: ${e.message}` },
      { status: 500 }
    );
  }

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("email_sending_domains")
    .insert({
      tenant_id: tenant.id,
      domain: trimmed,
      resend_domain_id: resendDomainId,
      dns_records: dnsRecords,
      verified: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ domain: data });
}
