import { Suspense } from "react";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { requireDirectorPage } from "@/lib/crm-auth";
import ImportPanel from "./ImportPanel";

export default async function ImportPage() {
  await requireDirectorPage();
  const { features } = await getTenant();
  if (!hasFeature(features, "crm_import")) redirect("/crm");
  const hasEnrichment = hasFeature(features, "crm_enrichment");
  return <Suspense><ImportPanel hasEnrichment={hasEnrichment} /></Suspense>;
}
