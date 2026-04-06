import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import MapBuilderPanel from "./MapBuilderPanel";

export const metadata = { title: "Map Builder | GroundGame" };

export default async function MapBuilderPage() {
  const [, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  if (!crmUser?.isAdmin) redirect("/crm/lists");

  return (
    <div style={{ height: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <MapBuilderPanel />
    </div>
  );
}
