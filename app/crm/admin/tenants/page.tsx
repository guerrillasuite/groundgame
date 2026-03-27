import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import TenantListPanel from "./TenantListPanel";

export default async function TenantsPage() {
  const user = await getCrmUser();
  if (!user?.isSuperAdmin) redirect("/crm");
  return <TenantListPanel />;
}
