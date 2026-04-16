import { requireDirectorPage } from "@/lib/crm-auth";
import DispositionsClient from "./DispositionsClient";

export const metadata = { title: "Disposition Colors — GroundGame CRM" };

export default async function DispositionsPage() {
  await requireDirectorPage();
  return <DispositionsClient />;
}
