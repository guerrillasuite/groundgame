export const dynamic = "force-dynamic";

import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";
import IntelBriefSettingsPanel from "./IntelBriefSettingsPanel";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default async function IntelBriefSettingsPage() {
  const user = await getCrmUser();
  if (!user || user.role === "operative" || user.role === null) redirect("/crm");
  const isDirector = user.role === "director" || user.isSuperAdmin;
  const tenant = await getTenant();
  const sb = makeSb();
  const { data } = await sb
    .from("tenant_news_settings")
    .select("*")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  return <IntelBriefSettingsPanel initialSettings={data ?? null} isDirector={isDirector} />;
}
