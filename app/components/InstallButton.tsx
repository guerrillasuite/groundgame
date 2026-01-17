"use client";
import { useEffect, useState } from "react";

type Props = {
  className?: string;
  label?: string;
};

export function InstallButton({ className, label = "Install App" }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onAvail = () => setReady(true);
    const onInstalled = () => setReady(false);

    document.addEventListener("pwa:install-available", onAvail);
    document.addEventListener("pwa:installed", onInstalled);

    return () => {
      document.removeEventListener("pwa:install-available", onAvail);
      document.removeEventListener("pwa:installed", onInstalled);
    };
  }, []);

  if (!ready) return null;

  return (
    <button
      type="button"
      className={className}
      aria-label="Install GroundGame"
      onClick={async () => {
        const prompt: any = (window as any).deferredPWAInstallPrompt;
        if (!prompt?.prompt) return;
        prompt.prompt();
        try {
          await prompt.userChoice; // optional: await user choice
        } finally {
          (window as any).deferredPWAInstallPrompt = undefined;
          setReady(false);
        }
      }}
    >
      {label}
    </button>
  );
}

