import { requireDirectorPage } from "@/lib/crm-auth";
import ContactTypesClient from "./ContactTypesClient";

export default async function ContactTypesPage() {
  await requireDirectorPage();
  return <ContactTypesClient />;
}
