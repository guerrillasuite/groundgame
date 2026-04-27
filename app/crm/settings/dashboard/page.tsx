export const dynamic = "force-dynamic";

import { requireCrmAccess } from "@/lib/crm-auth";
import DashboardSettingsPanel from "./DashboardSettingsPanel";

export default async function DashboardSettingsPage() {
  const user = await requireCrmAccess();
  if (!user?.isAdmin) return null;
  const isDirector = user.role === "director" || user.isSuperAdmin;
  return <DashboardSettingsPanel isDirector={isDirector} />;
}
