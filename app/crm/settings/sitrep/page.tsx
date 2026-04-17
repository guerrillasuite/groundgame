export const dynamic = "force-dynamic";

import { requireDirectorPage } from "@/lib/crm-auth";
import SitRepSettingsPanel from "./SitRepSettingsPanel";

export default async function SitRepSettingsPage() {
  await requireDirectorPage();
  return <SitRepSettingsPanel />;
}
