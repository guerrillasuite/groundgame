"use client";
import { useEffect } from "react";

// (Optional) If you're strict with TS, also add the global.d.ts below.
declare global {
  interface Window {
    deferredPWAInstallPrompt?: any;
  }
}

/**
 * Registers the service worker and captures the `beforeinstallprompt`
 * so you can show a custom Install button anywhere.
 *
 * Emits:
 *  - "pwa:install-available" on document when install is possible
 *  - "pwa:installed" after successful install
 */
export default function PwaInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register SW (safe if already registered)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    const onBip = (e: any) => {
      e.preventDefault();
      window.deferredPWAInstallPrompt = e;
      document.dispatchEvent(new Event("pwa:install-available"));
    };

    const onInstalled = () => {
      window.deferredPWAInstallPrompt = undefined;
      document.dispatchEvent(new Event("pwa:installed"));
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}

