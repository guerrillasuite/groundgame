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
  {
    slug: "task", name: "Task", color: "blue", sort_order: 0,
    is_mission_type: true, show_in_kanban: true, booking_enabled: false,
    stages: [
      { slug: "open",        name: "Open",        color: "blue",   is_terminal: false, sort_order: 0 },
      { slug: "in_progress", name: "In Progress", color: "amber",  is_terminal: false, sort_order: 1 },
      { slug: "done",        name: "Done",        color: "green",  is_terminal: true,  sort_order: 2 },
      { slug: "cancelled",   name: "Cancelled",   color: "slate",  is_terminal: true,  sort_order: 3 },
    ],
  },
  {
    slug: "event", name: "Event", color: "violet", sort_order: 1,
    is_mission_type: false, show_in_kanban: true, booking_enabled: false,
    stages: [
      { slug: "open",      name: "Open",      color: "violet", is_terminal: false, sort_order: 0 },
      { slug: "confirmed", name: "Confirmed", color: "blue",   is_terminal: false, sort_order: 1 },
      { slug: "done",      name: "Done",      color: "green",  is_terminal: true,  sort_order: 2 },
      { slug: "cancelled", name: "Cancelled", color: "slate",  is_terminal: true,  sort_order: 3 },
    ],
  },
  {
    slug: "meeting", name: "Meeting", color: "teal", sort_order: 2,
    is_mission_type: false, show_in_kanban: true, booking_enabled: false,
    stages: [
      { slug: "open",      name: "Open",      color: "teal",  is_terminal: false, sort_order: 0 },
      { slug: "confirmed", name: "Confirmed", color: "blue",  is_terminal: false, sort_order: 1 },
      { slug: "done",      name: "Done",      color: "green", is_terminal: true,  sort_order: 2 },
      { slug: "cancelled", name: "Cancelled", color: "slate", is_terminal: true,  sort_order: 3 },
    ],
  },
];

const SELECT_COLS = "id, name, slug, color, is_system, is_public, sort_order, stages, is_mission_type, show_in_kanban, booking_enabled, custom_roles";

async function getGlobalSeedTemplates(): Promise<typeof SYSTEM_SEED> {
  try {
    // Prefer global templates table (managed via /admin in sitrep-pwa)
    const sbRaw = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await sbRaw
      .from("sitrep_global_type_templates")
      .select("slug, name, color, is_mission_type, show_in_kanban, booking_enabled, stages, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (data && data.length > 0) return data as typeof SYSTEM_SEED;
  } catch { /* fall through to hardcoded defaults */ }
  // Safety net: never leave a tenant with zero types
  return SYSTEM_SEED;
}

export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_item_types")
    .select(SELECT_COLS)
    .eq("tenant_id", tenant.id)
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [...(data ?? [])] as any[];

  // Seed missing system types on first load — reads from global templates table
  const existingSlugs = new Set(rows.map((r) => r.slug));
  const seedTemplates = await getGlobalSeedTemplates();
  const missing = seedTemplates.filter((t) => !existingSlugs.has(t.slug));
  if (missing.length > 0) {
    const { data: inserted } = await sb
      .from("sitrep_item_types")
      .insert(missing.map((t) => ({ tenant_id: tenant.id, ...t, is_system: true, is_public: false })))
      .select(SELECT_COLS);
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

  const defaultStages = [
    { slug: "open",        name: "Open",      color: body.color ?? "blue", is_terminal: false, sort_order: 0 },
    { slug: "in_progress", name: "In Progress", color: "amber",            is_terminal: false, sort_order: 1 },
    { slug: "done",        name: "Done",      color: "green",              is_terminal: true,  sort_order: 2 },
    { slug: "cancelled",   name: "Cancelled", color: "slate",              is_terminal: true,  sort_order: 3 },
  ];

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_item_types")
    .insert({
      tenant_id:       tenant.id,
      name:            body.name.trim(),
      slug,
      color:           body.color ?? "blue",
      is_system:       false,
      is_public:       false,
      sort_order:      100,
      stages:          defaultStages,
      is_mission_type: false,
      show_in_kanban:  true,
      booking_enabled: false,
      custom_roles:    [],
    })
    .select(SELECT_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
