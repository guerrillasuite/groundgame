import type { Metadata } from "next";
import UsersPanel from "@/app/crm/users/UsersPanel";

export const metadata: Metadata = {
  title: "Users — GroundGame CRM",
};

export default function SettingsUsersPage() {
  return <UsersPanel />;
}
