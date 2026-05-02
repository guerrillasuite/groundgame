import { getCrmUser } from "@/lib/crm-auth";
import { makeAdminSb } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCrmUser();
  if (!user?.isSuperAdmin) redirect("/list");

  const sb = makeAdminSb();
  const { data: templates } = await sb
    .from("sitrep_global_type_templates")
    .select("*")
    .order("sort_order")
    .order("created_at");

  return <AdminPanel initialTemplates={templates ?? []} />;
}
