import { notFound } from "next/navigation";

// Catch-all so unmatched /crm/* URLs render app/crm/not-found.tsx inside CrmHeader
export default function CrmCatchAll() {
  notFound();
}
