import { NextRequest, NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function verifyPassword(plaintext: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const candidate = scryptSync(plaintext, salt, 64);
    return timingSafeEqual(Buffer.from(hash, "hex"), candidate);
  } catch {
    return false;
  }
}

type Ctx = { params: Promise<{ surveyId: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { surveyId } = await params;
  try {
    const { password } = await request.json();
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
    }

    const sb = makeSb();
    const { data: survey } = await sb
      .from("surveys")
      .select("password_hash")
      .eq("id", surveyId)
      .maybeSingle();

    if (!survey?.password_hash) {
      // No password set — allow through
      return NextResponse.json({ ok: true });
    }

    const ok = verifyPassword(password, survey.password_hash);
    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch (error) {
    console.error("Error verifying password:", error);
    return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 500 });
  }
}
