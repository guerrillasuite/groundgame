import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { ALL_FEATURE_KEYS, type FeatureKey } from "@/lib/features";

export const dynamic = "force-dynamic";

// Only these feature keys can be toggled by a tenant admin (not super admin only)
const SELF_SERVICE_KEYS: FeatureKey[] = [
  "pwa_storefront_take_order",
  "pwa_storefront_make_sale",
  "pwa_storefront_orders",
  "pwa_storefront_inventory",
  "pwa_storefront_survey",
];

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET() {
  const tenant = await getTenant();
  return NextResponse.json({ features: tenant.features });
}

export async function PATCH(req: NextRequest) {
  const tenant = await getTenant();
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.features)) {
    return NextResponse.json({ error: "features must be an array" }, { status: 400 });
  }

  const requested = body.features as string[];
  const invalid = requested.filter(
    (f) => !SELF_SERVICE_KEYS.includes(f as FeatureKey)
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Cannot self-service toggle: ${invalid.join(", ")}` },
      { status: 400 }
    );
  }

  // Merge: keep all existing features that aren't self-service, then add the requested ones
  const nonSelfService = tenant.features.filter(
    (f) => !SELF_SERVICE_KEYS.includes(f)
  );
  const next = [
    ...nonSelfService,
    ...(requested as FeatureKey[]).filter((f) =>
      ALL_FEATURE_KEYS.includes(f as FeatureKey)
    ),
  ];

  const sb = makeSb();
  const { error } = await sb
    .from("tenants")
    .update({ features: next })
    .eq("id", tenant.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ features: next });
}
