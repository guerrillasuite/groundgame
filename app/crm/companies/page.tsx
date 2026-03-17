"use client";

import SearchListPage from "@/app/components/crm/SearchListPage";

export default function CompaniesPage() {
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
    />
  );
}
