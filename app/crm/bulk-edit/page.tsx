import { requireDirectorPage } from "@/lib/crm-auth";
import BulkEditPanel from "./BulkEditPanel";

export const metadata = { title: "Bulk Edit — GroundGame CRM" };

export default async function BulkEditPage() {
  await requireDirectorPage();
  return <BulkEditPanel />;
}
