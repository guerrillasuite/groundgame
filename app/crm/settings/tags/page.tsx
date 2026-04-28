import { requireDirectorPage } from "@/lib/crm-auth";
import TagsClient from "./TagsClient";

export default async function TagsPage() {
  await requireDirectorPage();
  return <TagsClient />;
}
