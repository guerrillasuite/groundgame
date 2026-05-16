import { NextRequest } from "next/server";
import { handleCustomFieldPatch } from "@/lib/crm/custom-field-values";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return handleCustomFieldPatch(req, "locations", id);
}
