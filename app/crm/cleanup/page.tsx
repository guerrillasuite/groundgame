import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import CleanupPanel from "./CleanupPanel";

export default async function CleanupPage() {
  const { features } = await getTenant();
  if (!hasFeature(features, "crm_cleanup")) redirect("/crm");
  return <CleanupPanel />;
}
