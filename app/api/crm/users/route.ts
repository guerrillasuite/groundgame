import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  const [crmUser, tenant] = await Promise.all([getCrmUser(), getTenant()]);
  if (!crmUser || (crmUser.role !== "director" && crmUser.role !== "support")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json([]);
  }

  try {
    // Get user IDs that belong to this tenant
    const sb = createClient(supabaseUrl, serviceKey);
    const { data: memberships } = await sb
      .from("user_tenants")
      .select("user_id")
      .eq("tenant_id", tenant.id)
      .in("status", ["active", "invited"]);

    const tenantUserIds = new Set((memberships ?? []).map((m: any) => m.user_id));
    if (tenantUserIds.size === 0) return NextResponse.json([]);

    // Fetch all auth users and filter to this tenant's members
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });

    if (!res.ok) return NextResponse.json([]);

    const json = await res.json();
    const users: any[] = (json.users ?? []).filter((u: any) => tenantUserIds.has(u.id));

    return NextResponse.json(
      users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? "",
      }))
    );
  } catch {
    return NextResponse.json([]);
  }
}
