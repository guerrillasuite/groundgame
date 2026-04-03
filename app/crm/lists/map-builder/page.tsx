import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const metadata = { title: "Map Builder | GroundGame" };

const MapBuilderPanel = dynamic(() => import("./MapBuilderPanel"), { ssr: false });

export default async function MapBuilderPage() {
  const [, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  if (!crmUser?.isAdmin) redirect("/crm/lists");

  return (
    <div style={{ height: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <MapBuilderPanel />
    </div>
  );
}
