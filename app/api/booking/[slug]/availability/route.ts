import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSbRaw() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

function makeSbTenant(tenantId: string) {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { "X-Tenant-Id": tenantId } },
  });
}

// Returns array of { start: ISO, end: ISO } for next `days` days
// GET /api/booking/[slug]/availability?days=28
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const days = Math.min(parseInt(new URL(req.url).searchParams.get("days") ?? "28"), 90);

  // Look up booking type globally by slug
  const sbRaw = makeSbRaw();
  const { data: bt, error: btErr } = await sbRaw
    .from("sitrep_booking_types")
    .select("id, tenant_id, owner_id, duration_minutes, buffer_before, buffer_after, available_days, available_start, available_end, timezone, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (btErr || !bt) {
    return NextResponse.json({ error: "Booking page not found" }, { status: 404 });
  }

  const sb = makeSbTenant(bt.tenant_id);

  // Fetch existing items for the owner in the next `days` window
  const now = new Date();
  const windowEnd = new Date(now.getTime() + days * 86400000);

  const { data: existingItems } = await sb
    .from("sitrep_items")
    .select("start_at, end_at, due_date")
    .eq("created_by", bt.owner_id)
    .eq("tenant_id", bt.tenant_id)
    .neq("status", "cancelled")
    .not("start_at", "is", null)
    .gte("start_at", now.toISOString())
    .lte("start_at", windowEnd.toISOString());

  const busySlots = (existingItems ?? []).map((item: any) => ({
    start: new Date(item.start_at).getTime(),
    end: item.end_at
      ? new Date(item.end_at).getTime()
      : new Date(item.start_at).getTime() + 30 * 60000,
  }));

  // Generate candidate slots
  const tz = bt.timezone ?? "America/New_York";
  const duration = (bt.duration_minutes ?? 30) * 60000;
  const bufBefore = (bt.buffer_before ?? 0) * 60000;
  const bufAfter  = (bt.buffer_after  ?? 0) * 60000;
  const availDays: number[] = bt.available_days ?? [1, 2, 3, 4, 5];
  const [startH, startM] = (bt.available_start ?? "09:00").split(":").map(Number);
  const [endH,   endM  ] = (bt.available_end   ?? "17:00").split(":").map(Number);

  const slots: { start: string; end: string }[] = [];

  for (let d = 0; d < days; d++) {
    const dayDate = new Date(now.getTime() + d * 86400000);

    // Get weekday in the owner's timezone
    const weekday = parseInt(
      dayDate.toLocaleString("en-US", { timeZone: tz, weekday: "short" })
        .replace("Sun","0").replace("Mon","1").replace("Tue","2")
        .replace("Wed","3").replace("Thu","4").replace("Fri","5").replace("Sat","6")
    );

    if (!availDays.includes(weekday)) continue;

    // Build day boundaries in the owner's timezone
    const dateStr = dayDate.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
    const dayStart = new Date(`${dateStr}T${String(startH).padStart(2,"0")}:${String(startM).padStart(2,"0")}:00`);
    const dayEnd   = new Date(`${dateStr}T${String(endH).padStart(2,"0")}:${String(endM).padStart(2,"0")}:00`);

    // Adjust for timezone offset approximation
    // Use the browser's interpretation of the date; server-side we use UTC dates
    let cursor = dayStart.getTime();
    const endMs = dayEnd.getTime();

    while (cursor + duration <= endMs) {
      const slotStart = cursor;
      const slotEnd   = cursor + duration;

      // Skip past slots
      if (slotEnd <= Date.now() + 30 * 60000) { cursor += duration; continue; }

      // Check for overlap with busy slots (including buffers)
      const blocked = busySlots.some(
        (b) => slotStart < b.end + bufAfter && slotEnd > b.start - bufBefore
      );

      if (!blocked) {
        slots.push({
          start: new Date(slotStart).toISOString(),
          end:   new Date(slotEnd).toISOString(),
        });
      }

      cursor += duration;
    }
  }

  return NextResponse.json({ slots, timezone: tz });
}
