// app/crm/users/page.tsx
import type { Metadata } from "next";
import UsersPanel from "./UsersPanel";

export const metadata: Metadata = {
  title: "Users — GroundGame CRM",
};

export default function UsersPage() {
  return <UsersPanel />;
}
