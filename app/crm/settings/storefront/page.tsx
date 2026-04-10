import { redirect } from "next/navigation";

// Storefront tab settings have moved to the admin tenant panel (App Settings group).
export default function StorefrontSettingsRedirect() {
  redirect("/crm/admin/tenants");
}
