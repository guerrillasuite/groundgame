import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";

export default async function DoorsLayout({ children }: { children: React.ReactNode }) {
  const { features } = await getTenant();
  if (!hasFeature(features, "pwa_doors")) redirect("/");
  return <>{children}</>;
}
