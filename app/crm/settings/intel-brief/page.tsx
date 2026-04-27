export const dynamic = "force-dynamic";

import { requireDirectorPage } from "@/lib/crm-auth";
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
  await requireDirectorPage();
  const tenant = await getTenant();
  const sb = makeSb();
  const { data } = await sb
    .from("tenant_news_settings")
    .select("*")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  return <IntelBriefSettingsPanel initialSettings={data ?? null} />;
}
