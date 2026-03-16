import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { getWalklists } from "@/lib/db/doors";

export const dynamic = "force-dynamic";

export async function GET() {
  const [{ id: tenantId }, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  const lists = getWalklists(tenantId, crmUser?.userId);
  return NextResponse.json(lists);
}
