"use client";

import SearchListPage from "@/app/components/crm/SearchListPage";
import GeocodeButton from "./GeocodeButton";
import CreateLocationButton from "./CreateLocationButton";

export default function LocationsPage() {
  return (
    <SearchListPage
      title="Locations"
      searchEndpoint="/api/crm/locations/search"
      searchPlaceholder="Search by address, city, state, zip…"
      target="locations"
      columns={[{ key: "address", label: "Address", width: 520 }]}
      rowHrefPrefix="/crm/locations/"
      headerActions={
        <div style={{ display: "flex", gap: 8 }}>
          <CreateLocationButton />
          <GeocodeButton />
        </div>
      }
    />
  );
}
