import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import ImportPanel from "./ImportPanel";

export default async function ImportPage() {
  const { features } = await getTenant();
  if (!hasFeature(features, "crm_import")) redirect("/crm");
  const hasEnrichment = hasFeature(features, "crm_enrichment");
  return <ImportPanel hasEnrichment={hasEnrichment} />;
}
