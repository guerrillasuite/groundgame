import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { features } = await getTenant();
  if (!hasFeature(features, "crm_lists")) redirect("/crm");
  return <>{children}</>;
}
