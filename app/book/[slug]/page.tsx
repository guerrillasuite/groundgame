import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import BookingClient from "./BookingClient";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: bt } = await sb
    .from("sitrep_booking_types")
    .select("id, title, description, duration_minutes, timezone, owner_id, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!bt) notFound();

  // Fetch host name
  let hostName = "Your Host";
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${bt.owner_id}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (res.ok) {
      const u = await res.json();
      hostName = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? hostName;
    }
  } catch { /* best-effort */ }

  return (
    <BookingClient
      slug={slug}
      title={bt.title}
      description={bt.description ?? null}
      durationMinutes={bt.duration_minutes}
      timezone={bt.timezone}
      hostName={hostName}
    />
  );
}
