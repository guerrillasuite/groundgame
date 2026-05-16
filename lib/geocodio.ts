const GEOCODIO_BASE = "https://api.geocod.io/v1.7";

export type GeocodioResult = {
  lat: number;
  lon: number;
  congressional_district?: string;
  state_house_district?: string;
  state_senate_district?: string;
  county_name?: string;
  time_zone?: string;
  census_tract?: string;
  zip4?: string;
  formatted_address?: string;
};

export async function geocodeAddress(address: string): Promise<GeocodioResult | null> {
  const key = process.env.GEOCODIO_API_KEY;
  if (!key) {
    console.warn("GEOCODIO_API_KEY not set — skipping geocode");
    return null;
  }

  try {
    const params = new URLSearchParams({
      q: address,
      api_key: key,
      fields: "cd,stateleg,timezone,census2020",
    });

    const res = await fetch(`${GEOCODIO_BASE}/geocode?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;

    const loc = result.location;
    const fields = result.fields ?? {};

    return {
      lat: loc.lat,
      lon: loc.lng,
      formatted_address: result.formatted_address,
      congressional_district: fields.congressional_districts?.[0]?.district_number?.toString(),
      state_house_district: fields.state_legislative_districts?.house?.[0]?.district_number?.toString(),
      state_senate_district: fields.state_legislative_districts?.senate?.[0]?.district_number?.toString(),
      county_name: result.address_components?.county,
      time_zone: fields.timezone?.name,
      census_tract: fields.census?.census_tract,
      zip4: result.address_components?.zip4,
    };
  } catch {
    return null;
  }
}
