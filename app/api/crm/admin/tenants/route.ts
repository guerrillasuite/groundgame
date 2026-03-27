/**
 * GET  /api/crm/admin/tenants  — list all tenants (super-admin only)
 * POST /api/crm/admin/tenants  — create a new tenant (super-admin only)
 *
 * POST body: { slug: string, name: string }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAdminIdentity,
  assertSuperAdmin,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function errResponse(err: unknown) {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: (err as Error).message }, { status: (err as any).status });
  }
  const msg = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const identity = await getAdminIdentity(request);
    assertSuperAdmin(identity);

    const sb = makeSb();
    const { data, error } = await sb
      .from("tenants")
      .select("id, slug, name, plan, features, created_at")
      .order("name");

    if (error) throw new Error(error.message);

    return NextResponse.json(
      (data ?? []).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        plan: t.plan ?? "pro",
        features: t.features ?? [],
        createdAt: t.created_at,
      }))
    );
  } catch (err) {
    return errResponse(err);
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const identity = await getAdminIdentity(request);
    assertSuperAdmin(identity);

    const body = await request.json();
    const slug: string = (body.slug ?? "").trim().toLowerCase();
    const name: string = (body.name ?? "").trim();

    if (!slug || !name) {
      return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
    }
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json(
        { error: "Slug must be 3–63 lowercase letters, numbers, or hyphens" },
        { status: 400 }
      );
    }

    const sb = makeSb();
    const { data, error } = await sb
      .from("tenants")
      .insert({ slug, name })
      .select("id, slug, name, plan, features, created_at")
      .single();

    if (error) {
      const msg =
        error.code === "23505"
          ? `Slug "${slug}" is already taken`
          : error.message;
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    return NextResponse.json({
      id: data.id,
      slug: data.slug,
      name: data.name,
      plan: data.plan ?? "pro",
      features: data.features ?? [],
      createdAt: data.created_at,
    });
  } catch (err) {
    return errResponse(err);
  }
}
