import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  // Fetch original survey + questions
  const [{ data: survey }, { data: questions }] = await Promise.all([
    sb.from("surveys").select("*").eq("id", surveyId).maybeSingle(),
    sb.from("questions").select("*").eq("survey_id", surveyId).order("order_index", { ascending: true }),
  ]);

  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  // Generate new ID: strip any existing -copy-XXXX suffix then append new one
  const base = surveyId.replace(/-copy-[a-z0-9]+$/, "");
  const rand = Math.random().toString(36).slice(2, 6);
  const newId = `${base}-copy-${rand}`;

  // Insert duplicate survey
  const { error: surveyErr } = await sb.from("surveys").insert({
    id: newId,
    tenant_id: tenant.id,
    title: `${survey.title} (copy)`,
    description: survey.description,
    website_url: survey.website_url,
    footer_text: survey.footer_text,
    active: false, // start inactive so it doesn't accidentally go live
  });
  if (surveyErr) return NextResponse.json({ error: surveyErr.message }, { status: 500 });

  // Copy questions with new IDs
  if (questions && questions.length > 0) {
    const newQuestions = questions.map((q: any) => ({
      id: `${newId}-q${q.order_index}`,
      survey_id: newId,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      required: q.required,
      order_index: q.order_index,
    }));
    const { error: qErr } = await sb.from("questions").insert(newQuestions);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  return NextResponse.json({ survey_id: newId }, { status: 201 });
}
