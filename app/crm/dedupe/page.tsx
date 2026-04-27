import { Suspense } from "react";
import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";
import { requireDirectorPage } from "@/lib/crm-auth";
import DedupePanel from "./DedupePanel";

export default async function DedupePage() {
  await requireDirectorPage();
  const { features } = await getTenant();
  if (!hasFeature(features, "crm_dedupe")) redirect("/crm");
  return <Suspense><DedupePanel /></Suspense>;
}
