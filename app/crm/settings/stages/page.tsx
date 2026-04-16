import type { Metadata } from "next";
import { requireDirectorPage } from "@/lib/crm-auth";
import StagesClient from "./StagesClient";

export const metadata: Metadata = {
  title: "Pipeline Stages — GroundGame CRM",
};

export default async function StagesPage() {
  await requireDirectorPage();
  return <StagesClient />;
}
