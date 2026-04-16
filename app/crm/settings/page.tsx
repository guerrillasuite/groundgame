import { requireDirectorPage } from "@/lib/crm-auth";
import TenantSelfPanel from "./TenantSelfPanel";

export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  await requireDirectorPage();
  return <TenantSelfPanel />;
}
