import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: NextRequest) {
  const { first_name, last_name, email, phone, survey_id } = await request.json();
  const sb = getAnon();

  // Resolve tenant from survey
  const { data: survey } = await sb
    .from("surveys")
    .select("tenant_id")
    .eq("id", survey_id)
    .single();
  if (!survey) return NextResponse.json({ contact_id: null });
  const tenantId = survey.tenant_id;

  // 1. Exact email match
  if (email?.trim()) {
    const { data } = await sb
      .from("people")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();
    if (data) return NextResponse.json({ contact_id: data.id });
  }

  // 2. Phone match (normalize digits only)
  if (phone?.trim()) {
    const cleaned = phone.trim().replace(/\D/g, "");
    const { data: phonePeople } = await sb
      .from("people")
      .select("id, phone")
      .eq("tenant_id", tenantId)
      .not("phone", "is", null)
      .limit(200);
    const match = (phonePeople ?? []).find(
      (p) => (p.phone ?? "").replace(/\D/g, "") === cleaned
    );
    if (match) return NextResponse.json({ contact_id: match.id });
  }

  // 3. First + last name match (case-insensitive)
  if (first_name?.trim() && last_name?.trim()) {
    const { data } = await sb
      .from("people")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("first_name", first_name.trim())
      .ilike("last_name", last_name.trim())
      .limit(1)
      .maybeSingle();
    if (data) return NextResponse.json({ contact_id: data.id });
  }

  return NextResponse.json({ contact_id: null });
}
