import type { Metadata } from "next";
import { requireDirectorPage } from "@/lib/crm-auth";
import UsersPanel from "@/app/crm/users/UsersPanel";

export const metadata: Metadata = {
  title: "Users — GroundGame CRM",
};

export default async function SettingsUsersPage() {
  await requireDirectorPage();
  return <UsersPanel />;
}
