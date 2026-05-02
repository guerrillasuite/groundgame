import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBookingConfirmation } from "@/lib/email/sitrep-booking-confirm";

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

// POST /api/booking/[slug]/confirm
// Body: { name, email, notes?, start_at, end_at }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);

  if (!body?.name?.trim() || !body?.email?.trim()) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  if (!body?.start_at || !body?.end_at) {
    return NextResponse.json({ error: "start_at and end_at are required" }, { status: 400 });
  }

  // Look up booking type
  const sbRaw = makeSbRaw();
  const { data: bt } = await sbRaw
    .from("sitrep_booking_types")
    .select("id, tenant_id, owner_id, title, timezone, sitrep_item_type, confirmation_msg, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!bt) return NextResponse.json({ error: "Booking page not found" }, { status: 404 });

  const sb = makeSbTenant(bt.tenant_id);

  // ── Person match / create ────────────────────────────────────────────────────
  const email = body.email.trim().toLowerCase();
  const name  = body.name.trim();
  const [firstName, ...rest] = name.split(" ");
  const lastName = rest.join(" ") || null;

  let personId: string;
  const { data: existingPerson } = await sb
    .from("people")
    .select("id, tenant_people!inner(tenant_id)")
    .eq("tenant_people.tenant_id", bt.tenant_id)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existingPerson) {
    personId = existingPerson.id;
  } else {
    const newId = crypto.randomUUID();
    await sb.from("people").insert({
      id: newId,
      first_name:      firstName,
      last_name:       lastName,
      email:           email,
      data_source:     "booking",
      data_updated_at: new Date().toISOString(),
    });
    await sb.from("tenant_people").insert({
      tenant_id: bt.tenant_id,
      person_id: newId,
    });
    personId = newId;
  }

  // ── Get owner name ────────────────────────────────────────────────────────────
  let hostName = "Your Host";
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${bt.owner_id}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (authRes.ok) {
      const u = await authRes.json();
      hostName = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? hostName;
    }
  } catch { /* best-effort */ }

  // ── Re-check availability at confirm time (prevents double-booking) ────────────
  const reqStart = new Date(body.start_at).getTime();
  const reqEnd   = new Date(body.end_at).getTime();

  const { data: conflictData } = await sb.from("sitrep_items")
    .select("id")
    .eq("created_by", bt.owner_id)
    .eq("tenant_id", bt.tenant_id)
    .neq("status", "cancelled")
    .not("start_at", "is", null)
    .lt("start_at", body.end_at)
    .gt("end_at",   body.start_at);

  const hasConflict = (conflictData?.length ?? 0) > 0;

  if (hasConflict) {
    return NextResponse.json(
      { error: "This slot was just taken. Please choose another time." },
      { status: 409 }
    );
  }

  void reqStart; void reqEnd; // used implicitly via the DB query above

  // ── Create SitRep item ────────────────────────────────────────────────────────
  const { data: item, error: itemErr } = await sb
    .from("sitrep_items")
    .insert({
      tenant_id:  bt.tenant_id,
      item_type:  bt.sitrep_item_type,
      title:      `${bt.title} with ${name}`,
      start_at:   body.start_at,
      end_at:     body.end_at,
      status:     "confirmed",
      created_by: bt.owner_id,
      visibility: "team",
      description: body.notes?.trim() ?? null,
    })
    .select("id")
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: itemErr?.message ?? "Failed to create item" }, { status: 500 });
  }

  // ── Assign attendee ────────────────────────────────────────────────────────────
  await sb.from("sitrep_assignments").insert({
    item_id: item.id,
    user_id: personId,
    role:    "attendee",
  }).select().maybeSingle(); // ignore error if user_id isn't a UUID user

  // ── Send confirmation email ────────────────────────────────────────────────────
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://guerrillasuite.com";
  try {
    await sendBookingConfirmation({
      attendeeName:    name,
      attendeeEmail:   email,
      hostName,
      title:           bt.title,
      startAt:         body.start_at,
      endAt:           body.end_at,
      timezone:        bt.timezone,
      confirmationMsg: bt.confirmation_msg ?? undefined,
      bookingUrl:      `${origin}/book/${slug}`,
    });
  } catch (e) {
    console.error("[booking confirm] email send failed:", e);
  }

  return NextResponse.json({
    booking_id:       item.id,
    start_at:         body.start_at,
    end_at:           body.end_at,
    confirmation_msg: bt.confirmation_msg ?? null,
  }, { status: 201 });
}
