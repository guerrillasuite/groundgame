import "./styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GroundGame",
  description: "Field canvassing and phone banking app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Sets --app-vh on load and resize; inline script avoids client-chunk HMR crash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function s(){document.documentElement.style.setProperty('--app-vh',window.innerHeight*.01+'px');}s();window.addEventListener('resize',s);})();` }} />
        {children}
      </body>
    </html>
  );
}
