"use client";

import SearchListPage from "@/app/components/crm/SearchListPage";
import GeocodeButton from "./GeocodeButton";

export default function LocationsPage() {
  return (
    <SearchListPage
      title="Locations"
      searchEndpoint="/api/crm/locations/search"
      searchPlaceholder="Search by address, city, state, zip…"
      target="locations"
      columns={[{ key: "address", label: "Address", width: 520 }]}
      headerActions={<GeocodeButton />}
    />
  );
}
