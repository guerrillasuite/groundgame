// app/components/Header.tsx
import Image from "next/image";
import { InstallButton } from "./InstallButton";

type Props = {
  logoUrl?: string;
  appName?: string;
  showInstall?: boolean;
};

export function Header({ logoUrl, appName = "GroundGame", showInstall = false }: Props) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        {logoUrl ? (
          <Image src={logoUrl} alt={appName} width={28} height={28} className="app-header__logo" />
        ) : (
          <span className="app-header__initials" aria-hidden>
            {appName.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="app-header__name">{appName}</span>
      </div>
      {showInstall && <InstallButton className="app-header__install" label="Install" />}
    </header>
  );
}
