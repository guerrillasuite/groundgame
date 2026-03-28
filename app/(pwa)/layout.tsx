// app/(pwa)/layout.tsx
import { Header } from "../components/Header";
import { FooterNav } from "../components/FooterNav";
import { OfflineBanner } from "../components/OfflineBanner";
import PwaInit from "../components/PwaInit";
import { getTenantBranding, getTenant, BASE_BRANDING } from "@/lib/tenant";
import type { Metadata, Viewport } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getTenantBranding();
  return {
    title: b.appName,
    description: "Field ops, simplified.",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: b.appName },
    icons: {
      apple: "/icons/app-192.png",
      icon: [
        { url: "/icons/app-192.png", sizes: "192x192" },
        { url: "/icons/app-512.png", sizes: "512x512" },
      ],
    },
  };
}

// ✅ themeColor must be in viewport (or generateViewport) in Next 15
export async function generateViewport(): Promise<Viewport> {
  const b = await getTenantBranding();
  return { themeColor: b.primaryColor, viewportFit: "cover", width: "device-width", initialScale: 1 };
}

export default async function PwaLayout({ children }: { children: React.ReactNode }) {
  const [b, { features }] = await Promise.all([getTenantBranding(), getTenant()]);
  return (
    <div className="app-wrap">
      {b.primaryColor !== BASE_BRANDING.primaryColor && (
        <style>{`:root { --gg-primary: ${b.primaryColor}; }`}</style>
      )}
      <Header logoUrl={b.logoUrl} appName={b.appName} showInstall />
      <OfflineBanner />
      <main className="app-main">{children}</main>
      <FooterNav features={features} />
      <PwaInit />
    </div>
  );
}
