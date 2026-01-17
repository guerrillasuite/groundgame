// app/components/Icon.tsx
import React from "react";

type Props = { name: IconName; size?: number; className?: string; "aria-hidden"?: boolean };
type IconName = "phone" | "door" | "list" | "kanban" | "users" | "home" | "map" | "chev" | "flag";

const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" as const };

export function Icon({ name, size = 20, className, ...rest }: Props) {
  switch (name) {
    case "phone":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.6 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.12a2 2 0 0 1 2.11-.45c.85.28 1.73.48 2.63.6A2 2 0 0 1 22 16.92z"/>
      </svg>;
    case "door":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M3 21h18M6 21V5a2 2 0 0 1 2-2h8v18M14 11h0"/>
      </svg>;
    case "list":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
      </svg>;
    case "kanban":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M3 4h18v16H3zM8 4v16M16 4v10"/>
      </svg>;
    case "users":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M20 8a3 3 0 1 1-6 0"/>
      </svg>;
    case "home":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M3 11l9-8 9 8M4 10v10h16V10"/>
      </svg>;
    case "map":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M21 10c0 5-9 12-9 12S3 15 3 10a9 9 0 1 1 18 0z"/><path {...stroke} d="M12 10h0"/>
      </svg>;
    case "chev":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M9 6l6 6-6 6"/>
      </svg>;
    case "flag":
      return <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...rest}>
        <path {...stroke} d="M4 4v16M4 4h12l-2 4 2 4H4"/>
      </svg>;
    default:
      return null;
  }
}
