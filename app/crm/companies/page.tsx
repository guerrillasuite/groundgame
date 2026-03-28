"use client";

import SearchListPage from "@/app/components/crm/SearchListPage";
import CreateButton from "@/app/crm/_shared/CreateButton";
import { useRouter } from "next/navigation";

const FIELDS = [
  { name: "name",     label: "Name *",   placeholder: "Acme Corp" },
  { name: "industry", label: "Industry", placeholder: "Technology" },
  { name: "domain",   label: "Domain",   placeholder: "acme.com" },
  { name: "phone",    label: "Phone",    type: "tel" as const },
  { name: "email",    label: "Email",    type: "email" as const },
  { name: "status",   label: "Status",   type: "select" as const, options: [
    { value: "active",   label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "prospect", label: "Prospect" },
  ]},
];

export default function CompaniesPage() {
  const router = useRouter();

  async function createAction(fd: FormData) {
    const body: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = fd.get(f.name);
      if (v) body[f.name] = String(v);
    }
    if (!body.name?.trim()) throw new Error("Name is required");
    const res = await fetch("/api/crm/companies/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create company");
    router.refresh();
  }

  return (
    <SearchListPage
      title="Companies"
      searchEndpoint="/api/crm/companies/search"
      searchPlaceholder="Search by name, industry, domain…"
      target="companies"
      columns={[
        { key: "name",     label: "Name",     width: 260 },
        { key: "industry", label: "Industry", width: 180 },
        { key: "domain",   label: "Domain",   width: 200 },
        { key: "status",   label: "Status",   width: 100 },
      ]}
      rowHrefPrefix="/crm/companies/"
      headerActions={
        <CreateButton
          title="New Company"
          buttonLabel="+ New Company"
          fields={FIELDS}
          action={createAction}
          onCreated={() => router.refresh()}
        />
      }
    />
  );
}
