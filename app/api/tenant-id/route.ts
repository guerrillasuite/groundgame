// app/api/tenant-id/route.ts
import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const t = await getTenant();
    return NextResponse.json({ tenant_id: t?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ tenant_id: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
