import { NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm-auth";

export async function GET() {
  const crmUser = await getCrmUser();
  if (!crmUser || (crmUser.role !== "admin" && crmUser.role !== "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const json = await res.json();
    const users = json.users ?? [];

    return NextResponse.json(
      users.map((u: any) => ({
        id: u.id,
        email: u.email ?? "",
        name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? "",
      }))
    );
  } catch {
    return NextResponse.json([]);
  }
}
