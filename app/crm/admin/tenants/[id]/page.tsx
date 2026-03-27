import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import TenantEditPanel from "./TenantEditPanel";

export default async function TenantEditPage({ params }: { params: { id: string } }) {
  const user = await getCrmUser();
  if (!user?.isSuperAdmin) redirect("/crm");
  return <TenantEditPanel id={params.id} />;
}
