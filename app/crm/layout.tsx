// app/crm/layout.tsx
import type { Metadata } from "next";
import CrmHeader from "@/app/components/crm/CrmHeader";
import CrmFooter from "@/app/components/crm/CrmFooter";

export const metadata: Metadata = {
  title: "GroundGame CRM",
  description: "Manage Opportunities, People, Households, and more.",
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-wrap bg-app">
      <a href="#crm-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <CrmHeader />
      <main id="crm-main" className="crm-main">{children}</main>
      <CrmFooter />
    </div>
  );
}
