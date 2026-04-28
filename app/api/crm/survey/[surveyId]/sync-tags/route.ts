import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: Promise<{ surveyId: string }> };

// POST /api/crm/survey/[surveyId]/sync-tags
// Called at form save/publish — find-or-create tags for all tag-mapped questions.
// Body: { questions: Array<{ tag_prefix: string; options: string[] }> }
export async function POST(req: NextRequest, { params }: Params) {
  const { surveyId } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const body = await req.json().catch(() => null);

  const questions: { tag_prefix: string; options: string[] }[] = Array.isArray(body?.questions)
    ? body.questions
    : [];

  const created: string[] = [];
  const reused: string[] = [];

  for (const q of questions) {
    if (!q.tag_prefix?.trim() || !Array.isArray(q.options)) continue;
    for (const opt of q.options) {
      if (!opt?.trim()) continue;
      const tagName = `${q.tag_prefix.trim()}:${opt.trim()}`;

      const { data: existing } = await sb
        .from("tenant_tags")
        .select("id")
        .eq("tenant_id", tenant.id)
        .ilike("name", tagName)
        .maybeSingle();

      if (existing) {
        reused.push(tagName);
      } else {
        await sb.from("tenant_tags").insert({ tenant_id: tenant.id, name: tagName });
        created.push(tagName);
      }
    }
  }

  return NextResponse.json({ created, reused, survey_id: surveyId });
}
