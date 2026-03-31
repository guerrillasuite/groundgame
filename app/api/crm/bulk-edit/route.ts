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

type Target = "people" | "households" | "locations" | "companies";

// Fields that can be set via standard batch UPDATE on the entity's table
const BULK_EDITABLE: Record<Target, readonly string[]> = {
  people:     ["contact_type", "notes"],
  households: ["notes"],
  locations:  ["notes"],
  companies:  ["status", "industry", "notes"],
};

// These keys are handled separately (not direct table columns)
const SPECIAL_KEYS = new Set(["contact_types", "notes_mode"]);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { target, ids, updates } = body as {
    target: Target;
    ids: string[];
    updates: Record<string, any>;
  };

  const VALID_TARGETS: Target[] = ["people", "households", "locations", "companies"];
  if (!VALID_TARGETS.includes(target)) {
    return NextResponse.json({ error: `Invalid target: ${target}` }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
  }
  if (ids.length > 2000) {
    return NextResponse.json({ error: "Max 2000 IDs per request" }, { status: 400 });
  }

  const allowed = BULK_EDITABLE[target];

  // Build standard updates (direct table columns, excludes special keys and notes-in-append-mode)
  const standardUpdates: Record<string, any> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (SPECIAL_KEYS.has(key)) continue;
    if (key === "notes" && updates.notes_mode === "append") continue;
    if (allowed.includes(key)) standardUpdates[key] = val;
  }

  const errors: string[] = [];
  const chunks = chunk(ids, 200);

  // ── 1. Standard batch updates ─────────────────────────────────────────────
  if (Object.keys(standardUpdates).length > 0) {
    for (const c of chunks) {
      // People table is tenant-scoped via tenant_people join, not tenant_id column
      const q = target === "people"
        ? sb.from("people").update(standardUpdates).in("id", c)
        : sb.from(target).update(standardUpdates).in("id", c).eq("tenant_id", tenant.id);
      const { error } = await q;
      if (error) errors.push(error.message);
    }

    // For contact_type on people: also sync the tenant_people row
    if (target === "people" && standardUpdates.contact_type !== undefined) {
      for (const c of chunks) {
        const { error } = await sb
          .from("tenant_people")
          .update({ contact_type: standardUpdates.contact_type })
          .in("person_id", c)
          .eq("tenant_id", tenant.id);
        if (error) errors.push(`tenant_people.contact_type: ${error.message}`);
      }
    }
  }

  // ── 2. contact_types array update (people → tenant_people) ────────────────
  if (target === "people" && updates.contact_types !== undefined) {
    const contactTypes = Array.isArray(updates.contact_types) ? updates.contact_types : [];
    for (const c of chunks) {
      const { error } = await sb
        .from("tenant_people")
        .update({ contact_types: contactTypes })
        .in("person_id", c)
        .eq("tenant_id", tenant.id);
      if (error) errors.push(`contact_types: ${error.message}`);
    }
  }

  // ── 3. Notes append mode (per-record fetch + update) ──────────────────────
  if (updates.notes !== undefined && updates.notes_mode === "append" && allowed.includes("notes")) {
    for (const c of chunks) {
      const fetchQ = target === "people"
        ? sb.from("people").select("id, notes").in("id", c)
        : sb.from(target).select("id, notes").in("id", c).eq("tenant_id", tenant.id);

      const { data: existing } = await fetchQ;
      if (!Array.isArray(existing)) continue;

      for (const row of existing as { id: string; notes: string | null }[]) {
        const prev = row.notes ? String(row.notes) : "";
        const merged = prev ? `${prev}\n\n${updates.notes}` : updates.notes;
        const updateQ = target === "people"
          ? sb.from("people").update({ notes: merged }).eq("id", row.id)
          : sb.from(target).update({ notes: merged }).eq("id", row.id).eq("tenant_id", tenant.id);
        const { error } = await updateQ;
        if (error) errors.push(error.message);
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ updated: ids.length, errors }, { status: 207 });
  }
  return NextResponse.json({ updated: ids.length });
}
