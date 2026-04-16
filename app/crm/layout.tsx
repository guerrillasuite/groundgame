// app/crm/layout.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CrmHeader from "@/app/components/crm/CrmHeader";
import { getTenant, getTenantBranding, BASE_BRANDING } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const metadata: Metadata = {
  title: "GroundGame CRM",
  description: "Manage Opportunities, People, Households, and more.",
};

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const [tenant, user, branding] = await Promise.all([getTenant(), getCrmUser(), getTenantBranding()]);

  // Operatives have no CRM access — send them to the PWA
  if (user?.role === "operative") redirect("/");

  return (
    <div className="crm-wrap bg-app">
      {branding.primaryColor !== BASE_BRANDING.primaryColor && (
        <style>{`:root { --gg-primary: ${branding.primaryColor}; }`}</style>
      )}
      <a href="#crm-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <CrmHeader
        features={tenant.features}
        isSuperAdmin={user?.isSuperAdmin ?? false}
        role={user?.role ?? null}
      />
      <main id="crm-main" className="crm-main">{children}</main>
    </div>
  );
}
