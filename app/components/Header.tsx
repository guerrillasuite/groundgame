// app/components/Header.tsx
import { InstallButton } from "./InstallButton"; // create this from the snippet I shared

type Props = {
  logoUrl?: string;
  appName?: string;
  showInstall?: boolean; // <â€” new
};

export function Header({ logoUrl, appName, showInstall = false }: Props) {
  return (
    <header className="app-header">
      {/* your existing header UI */}
      <div className="left">
        {/* logo/title */}
      </div>
      <div className="right">
        {/* e.g., link to /crm */}
        {showInstall && <InstallButton />}
      </div>
    </header>
  );
}

