// app/crm/layout.tsx
import type { Metadata } from "next";
import CrmHeader from "@/app/components/crm/CrmHeader";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const metadata: Metadata = {
  title: "GroundGame CRM",
  description: "Manage Opportunities, People, Households, and more.",
};

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  const user = await getCrmUser();

  return (
    <div className="crm-wrap bg-app">
      <a href="#crm-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <CrmHeader features={tenant.features} isSuperAdmin={user?.isSuperAdmin ?? false} />
      <main id="crm-main" className="crm-main">{children}</main>
    </div>
  );
}
