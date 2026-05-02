import { NextRequest, NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm-auth";
import { makeServiceSb } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.body?.trim() || !body?.tenantId) {
    return NextResponse.json({ error: "body and tenantId required" }, { status: 400 });
  }

  const sb = makeServiceSb(body.tenantId);

  const { data, error } = await sb
    .from("sitrep_comments")
    .insert({
      item_id:   id,
      tenant_id: body.tenantId,
      author_id: user.userId,
      body:      body.body.trim(),
    })
    .select("id, body, author_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
