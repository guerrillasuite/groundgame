import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { requireDirectorPage } from "@/lib/crm-auth";
import CleanupPanel from "./CleanupPanel";

export default async function CleanupPage() {
  await requireDirectorPage();
  const { features } = await getTenant();
  if (!hasFeature(features, "crm_cleanup")) redirect("/crm");
  return <CleanupPanel />;
}
