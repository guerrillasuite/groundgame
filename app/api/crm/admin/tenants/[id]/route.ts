import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminIdentity, assertSuperAdmin } from "@/lib/adminAuth";
import { ALL_FEATURE_KEYS, type FeatureKey } from "@/lib/features";

export const dynamic = "force-dynamic";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const identity = await getAdminIdentity(request);
  try {
    assertSuperAdmin(identity);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
  }

  const sb = makeSb();
  const { data, error } = await sb
    .from("tenants")
    .select("id, slug, name, plan, features, created_at")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    slug: data.slug,
    name: data.name,
    plan: data.plan ?? "pro",
    features: (data.features as FeatureKey[]) ?? [...ALL_FEATURE_KEYS],
    createdAt: data.created_at,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const identity = await getAdminIdentity(request);
  try {
    assertSuperAdmin(identity);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
  }

  let body: { name?: string; plan?: string; features?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }

  if (body.plan !== undefined) {
    patch.plan = body.plan;
  }

  if (body.features !== undefined) {
    const invalid = body.features.filter(
      (f) => !ALL_FEATURE_KEYS.includes(f as FeatureKey)
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown feature keys: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    patch.features = body.features;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const sb = makeSb();
  const { data, error } = await sb
    .from("tenants")
    .update(patch)
    .eq("id", params.id)
    .select("id, slug, name, plan, features, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    slug: data.slug,
    name: data.name,
    plan: data.plan ?? "pro",
    features: (data.features as FeatureKey[]) ?? [...ALL_FEATURE_KEYS],
    createdAt: data.created_at,
  });
}
