export const dynamic = "force-dynamic";

import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import SitRepSettingsPanel from "./SitRepSettingsPanel";

export default async function SitRepSettingsPage() {
  const user = await getCrmUser();
  if (!user || user.role === "operative" || user.role === null) redirect("/crm");
  return <SitRepSettingsPanel isDirector={user.role === "director" || user.isSuperAdmin} />;
}
