import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "SitRep",
  description: "Your tasks, events, and calendar — always in your pocket.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SitRep",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0d14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ background: "rgb(10 13 20)", color: "rgb(236 240 245)" }}>
        {/* Apply saved text-size before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var s=localStorage.getItem('sitrep_text_size');if(s&&s!=='normal')document.documentElement.setAttribute('data-text-size',s);})();` }} />
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
