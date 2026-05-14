import { NextRequest, NextResponse } from "next/server";
import { createSurvey, getSurveys, createQuestion } from "@/lib/db/supabase-surveys";
import { getTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const tenant = await getTenant();
  const surveys = await getSurveys(tenant.id);
  const channel = request.nextUrl.searchParams.get("channel");
  const filtered = channel
    ? surveys.filter((s) => {
        const ch = s.active_channels;
        if (!ch || ch.length === 0) return false; // require explicit channel opt-in
        return ch.includes(channel as any);
      })
    : surveys;
  return NextResponse.json(filtered.map((s) => ({ id: s.id, title: s.title })));
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const { title, description, id: customId, form_type, status, opp_trigger, questions } = await request.json();
    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const tenant = await getTenant();

    let survey_id: string;
    if (customId?.trim() && /^[a-z0-9-]+$/.test(customId.trim())) {
      survey_id = customId.trim();
    } else {
      const slug = slugify(title.trim()) || "survey";
      const rand = Math.random().toString(36).slice(2, 6);
      survey_id = `${slug}-${rand}`;
    }

    await createSurvey({
      id: survey_id,
      title: title.trim(),
      description: description?.trim(),
      tenantId: tenant.id,
      form_type: form_type ?? "custom",
      status: status ?? "draft",
      opp_trigger: opp_trigger ?? null,
    });

    if (Array.isArray(questions) && questions.length > 0) {
      for (const q of questions) {
        const qSlug = slugify(q.question_text || "question") || "question";
        const qId = `${qSlug}-${Math.random().toString(36).slice(2, 6)}`;
        await createQuestion(survey_id, {
          id: qId,
          question_text: q.question_text,
          question_type: q.question_type,
          options: Array.isArray(q.options) && q.options.length > 0 ? q.options : null,
          display_format: q.display_format ?? null,
          crm_field: q.crm_field ?? null,
          required: q.required ?? false,
          order_index: q.order_index,
        });
      }
    }

    return NextResponse.json({ survey_id }, { status: 201 });
  } catch (error) {
    console.error("Error creating survey:", error);
    return NextResponse.json({ error: "Failed to create survey" }, { status: 500 });
  }
}
