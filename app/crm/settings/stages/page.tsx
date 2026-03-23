import type { Metadata } from "next";
import StagesClient from "./StagesClient";

export const metadata: Metadata = {
  title: "Pipeline Stages — GroundGame CRM",
};

export default function StagesPage() {
  return <StagesClient />;
}
