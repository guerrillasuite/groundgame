import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const SYSTEM_SEED = [
  { slug: "task",    name: "Task",    color: "blue",   sort_order: 0 },
  { slug: "event",   name: "Event",   color: "violet", sort_order: 1 },
  { slug: "meeting", name: "Meeting", color: "teal",   sort_order: 2 },
];

export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_item_types")
    .select("id, name, slug, color, is_system, is_public, sort_order")
    .eq("tenant_id", tenant.id)
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [...(data ?? [])] as any[];

  // Seed missing system types on first load
  const existingSlugs = new Set(rows.map((r) => r.slug));
  const missing = SYSTEM_SEED.filter((t) => !existingSlugs.has(t.slug));
  if (missing.length > 0) {
    const { data: inserted } = await sb
      .from("sitrep_item_types")
      .insert(missing.map((t) => ({ tenant_id: tenant.id, ...t, is_system: true, is_public: false })))
      .select("id, name, slug, color, is_system, is_public, sort_order");
    rows.push(...(inserted ?? []));
    rows.sort((a, b) => a.sort_order - b.sort_order);
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;

  const tenant = await getTenant();
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const slug = body.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_item_types")
    .insert({
      tenant_id:  tenant.id,
      name:       body.name.trim(),
      slug,
      color:      body.color ?? "blue",
      is_system:  false,
      is_public:  false,
      sort_order: 100,
    })
    .select("id, name, slug, color, is_system, is_public, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
