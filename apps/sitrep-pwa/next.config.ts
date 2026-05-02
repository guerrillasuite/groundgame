import type { NextConfig } from "next";

// Deployed at: https://app.sitrep.digital
// Railway service: sitrep-pwa (separate from GroundGame)
// Env: NEXT_PUBLIC_APP_URL=https://app.sitrep.digital
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  // Allow importing from parent monorepo lib
  transpilePackages: [],
  experimental: {
    // Allow resolving outside of app dir for shared lib imports
  },
};

export default nextConfig;
