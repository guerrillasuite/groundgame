import SearchListPage from "@/app/components/crm/SearchListPage";

export default function HouseholdsPage() {
  return (
    <SearchListPage
      title="Households"
      searchEndpoint="/api/crm/households/search"
      searchPlaceholder="Search by household name…"
      columns={[
        { key: "name",    label: "Name",    width: 240 },
        { key: "address", label: "Address", width: 400 },
      ]}
      target="households"
      rowHrefPrefix="/crm/households/"
    />
  );
}
