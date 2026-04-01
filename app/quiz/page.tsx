import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface Props {
  searchParams: Promise<{ kiosk?: string }>;
}

export default async function QuizPage({ searchParams }: Props) {
  const tenant = await getTenant();
  const { kiosk } = await searchParams;
  const sb = makeSb();

  const { data: survey } = await sb
    .from("surveys")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .ilike("id", "wspq-%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!survey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "#94a3b8", fontSize: 16 }}>Quiz not available.</p>
      </div>
    );
  }

  redirect(`/s/${survey.id}${kiosk === "1" ? "?kiosk=1" : ""}`);
}
