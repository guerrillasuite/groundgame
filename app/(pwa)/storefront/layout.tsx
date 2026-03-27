import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { redirect } from "next/navigation";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { features } = await getTenant();
  if (!hasFeature(features, "pwa_storefront")) redirect("/");
  return <section style={{ padding: 16 }}>{children}</section>;
}
