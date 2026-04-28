/*
  ─── DB MIGRATIONS (run once in Supabase SQL editor) ─────────────────────────

  -- 1. Tag library
  CREATE TABLE tenant_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX idx_tenant_tags_tenant ON tenant_tags(tenant_id);
  ALTER TABLE tenant_tags ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "tenant_scoped" ON tenant_tags
    USING (tenant_id = (current_setting('request.headers')::json->>'x-tenant-id')::uuid);

  -- 2. Tags array on tenant_people
  ALTER TABLE tenant_people
    ADD COLUMN IF NOT EXISTS tags UUID[] NOT NULL DEFAULT '{}';
  CREATE INDEX idx_tenant_people_tags ON tenant_people USING GIN(tags);

  ─────────────────────────────────────────────────────────────────────────────
*/

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

// GET /api/crm/tags — list all tags with contact counts
export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("tenant_tags")
    .select("id, name, created_at")
    .eq("tenant_id", tenant.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch contact counts via a single aggregation query
  const ids = (data ?? []).map((t: any) => t.id) as string[];
  const countMap: Record<string, number> = {};
  if (ids.length > 0) {
    // Use contains operator to count each tag separately — done in JS for simplicity
    // For large tenants a Postgres RPC would be better, but tags are low-cardinality
    for (const tag of data ?? []) {
      const { count } = await sb
        .from("tenant_people")
        .select("person_id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .contains("tags", [tag.id]);
      countMap[tag.id] = count ?? 0;
    }
  }

  const rows = (data ?? []).map((t: any) => ({ ...t, contact_count: countMap[t.id] ?? 0 }));
  return NextResponse.json(rows);
}

// POST /api/crm/tags — create a new tag
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await sb
    .from("tenant_tags")
    .insert({ tenant_id: tenant.id, name })
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A tag with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...data, contact_count: 0 }, { status: 201 });
}
