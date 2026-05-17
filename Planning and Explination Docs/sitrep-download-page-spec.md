# SitRep — `/download` Page Spec
## `apps/sitrep-pwa/app/download/page.tsx`
**Status:** Ready for implementation  
**Route:** `app.sitrep.digital/download`  
**Stack:** Next.js App Router, TypeScript, inline styles (no Tailwind dependency assumed)

---

## Overview

A standalone marketing/onboarding page that walks users through installing SitRep as a PWA on their device. No auth, no tenant context. Fully public.

The page auto-detects the user's platform (Android vs. iOS) and expands the relevant install section by default. Both sections are collapsible — only one can be open at a time.

---

## File Structure

```
apps/sitrep-pwa/
  app/
    download/
      page.tsx           ← Server component shell (metadata only)
      DownloadClient.tsx ← "use client" — all interactive logic lives here
```

---

## Design Language

SitRep uses its own CSS variables on this standalone domain. Do **not** use `--gg-primary`. Use `--sr-green` throughout.

### CSS Variables (define in a `<style>` tag at the top of DownloadClient or in globals.css)

```css
:root {
  --sr-green: #22c55e;
  --sr-green-dim: rgba(34, 197, 94, 0.12);
  --sr-green-border: rgba(34, 197, 94, 0.3);
  --sr-green-glow: 0 0 24px rgba(34, 197, 94, 0.25);

  --bg:      rgb(10, 13, 20);
  --surface: rgb(14, 18, 28);
  --card:    rgb(20, 25, 38);
  --border:  rgba(255, 255, 255, 0.07);
  --text:    rgb(236, 240, 245);
  --dim:     rgb(100, 116, 139);
  --dimBright: rgb(148, 163, 184);
}
```

### Typography

Use `DM Sans` (Google Fonts) as the primary font — geometric, modern, readable at small sizes. Import at the top of the page:

```tsx
import { DM_Sans } from 'next/font/google';
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });
```

Apply `className={dmSans.className}` to the root `<div>`.

---

## `page.tsx` — Server Shell

```tsx
import type { Metadata } from 'next';
import DownloadClient from './DownloadClient';

export const metadata: Metadata = {
  title: 'Get SitRep on Your Device',
  description: 'Install SitRep as an app on your phone or tablet. No app store required.',
};

export default function DownloadPage() {
  return <DownloadClient />;
}
```

---

## `DownloadClient.tsx` — Full Implementation

### File header + imports

```tsx
'use client';

import { useState, useEffect } from 'react';
import { DM_Sans } from 'next/font/google';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

type Platform = 'ios' | 'android' | 'unknown';
```

### Platform detection hook

```tsx
function useDetectedPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>('unknown');

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      setPlatform('ios');
    } else if (/Android/.test(ua)) {
      setPlatform('android');
    } else {
      // Default: show android first on unknown/desktop
      setPlatform('android');
    }
  }, []);

  return platform;
}
```

### Surface token object

```tsx
const S = {
  bg:        'rgb(10, 13, 20)',
  surface:   'rgb(14, 18, 28)',
  card:      'rgb(20, 25, 38)',
  border:    'rgba(255, 255, 255, 0.07)',
  text:      'rgb(236, 240, 245)',
  dim:       'rgb(100, 116, 139)',
  dimBright: 'rgb(148, 163, 184)',
  green:     '#22c55e',
  greenDim:  'rgba(34, 197, 94, 0.12)',
  greenBorder: 'rgba(34, 197, 94, 0.3)',
} as const;
```

---

## Component Structure

```
<DownloadClient>
  ├── <HeroSection />
  ├── <InstallSection />        ← contains both platform accordions
  │   ├── <PlatformCard platform="android" />
  │   └── <PlatformCard platform="ios" />
  ├── <ManageSection />
  └── <Footer />
```

---

## Section 1: Hero

```tsx
function HeroSection() {
  return (
    <section style={{
      textAlign: 'center',
      padding: '72px 24px 56px',
      maxWidth: 680,
      margin: '0 auto',
    }}>
      {/* Logo lockup */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 32,
      }}>
        {/* Calendar icon — inline SVG */}
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="9" fill="#22c55e" />
          <rect x="8" y="10" width="20" height="18" rx="3" stroke="white" strokeWidth="2" fill="none"/>
          <line x1="8" y1="15" x2="28" y2="15" stroke="white" strokeWidth="2"/>
          <line x1="13" y1="8" x2="13" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1="23" y1="8" x2="23" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <rect x="12" y="19" width="4" height="3" rx="1" fill="white"/>
          <rect x="20" y="19" width="4" height="3" rx="1" fill="white"/>
        </svg>
        <span style={{
          fontSize: 28,
          fontWeight: 800,
          color: S.text,
          letterSpacing: '-0.5px',
        }}>
          Sit<span style={{ color: S.green }}>Rep</span>
        </span>
      </div>

      {/* Headline */}
      <h1 style={{
        fontSize: 'clamp(36px, 7vw, 56px)',
        fontWeight: 800,
        color: S.text,
        lineHeight: 1.1,
        letterSpacing: '-1px',
        marginBottom: 16,
      }}>
        Get <span style={{ color: S.green }}>SitRep</span>{' '}
        on Your Device
      </h1>

      {/* Subheadline */}
      <p style={{
        fontSize: 17,
        color: S.dimBright,
        lineHeight: 1.6,
        maxWidth: 480,
        margin: '0 auto 40px',
      }}>
        SitRep is a Progressive Web App. Install it on your phone or tablet
        for a native app experience — no app store required.
      </p>

      {/* Feature badges — 4 in a row */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {[
          { icon: '⚡', label: 'Fast', sub: 'Launch in a snap' },
          { icon: '📶', label: 'Offline Ready', sub: 'Works where you are' },
          { icon: '🔔', label: 'Push Alerts', sub: 'Never miss an update' },
          { icon: '🔒', label: 'Secure', sub: 'Your data is protected' },
        ].map(({ icon, label, sub }) => (
          <div key={label} style={{
            background: S.card,
            border: `1px solid ${S.border}`,
            borderRadius: 14,
            padding: '16px 20px',
            minWidth: 110,
            flex: '1 1 110px',
            maxWidth: 150,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: S.dim, lineHeight: 1.4 }}>{sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

---

## Section 2: Install Section

### Step data

Define this outside the component — the exact steps for each platform:

```tsx
const ANDROID_STEPS = [
  {
    number: 1,
    icon: '🌐',
    title: 'Open in Chrome',
    detail: 'Navigate to app.sitrep.digital in Google Chrome. Chrome may show an automatic "Add to Home Screen" banner — if so, tap it and skip to step 4.',
  },
  {
    number: 2,
    icon: '⋮',
    title: 'Tap the menu',
    detail: 'Tap the three-dot menu icon (⋮) in the top-right corner of Chrome to open the browser menu.',
  },
  {
    number: 3,
    icon: '➕',
    title: 'Add to Home Screen',
    detail: 'Scroll through the menu and tap "Add to Home Screen." A popup will appear showing the SitRep app name and icon.',
  },
  {
    number: 4,
    icon: '✓',
    title: 'Tap Add & launch',
    detail: 'Tap "Add" in the popup to confirm. SitRep will appear on your home screen like any other app. Tap its icon to launch.',
  },
];

const IOS_STEPS = [
  {
    number: 1,
    icon: '🧭',
    title: 'Open in Safari',
    detail: 'Navigate to app.sitrep.digital in Safari. Safari is required for the best install experience on iPhone and iPad.',
  },
  {
    number: 2,
    icon: '⬆️',
    title: 'Tap the Share button',
    detail: 'Tap the Share icon at the bottom of Safari — it looks like a square with an arrow pointing upward.',
  },
  {
    number: 3,
    icon: '📲',
    title: 'Add to Home Screen',
    detail: 'Scroll down in the share sheet and tap "Add to Home Screen." You can customize the app name before confirming.',
  },
  {
    number: 4,
    icon: '✓',
    title: 'Tap Add & launch',
    detail: 'Tap "Add" in the top-right corner to confirm. SitRep will appear on your home screen. Tap its icon to launch.',
  },
];
```

### PlatformCard component

```tsx
function PlatformCard({
  platform,
  isOpen,
  onToggle,
}: {
  platform: 'android' | 'ios';
  isOpen: boolean;
  onToggle: () => void;
}) {
  const isAndroid = platform === 'android';
  const steps = isAndroid ? ANDROID_STEPS : IOS_STEPS;
  const label = isAndroid ? 'Android' : 'iOS (iPhone & iPad)';
  const browserNote = isAndroid ? 'Use Google Chrome' : 'Use Safari';
  const platformIcon = isAndroid ? '🤖' : '🍎';

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${isOpen ? S.greenBorder : S.border}`,
      borderRadius: 18,
      overflow: 'hidden',
      transition: 'border-color 0.2s ease',
      boxShadow: isOpen ? '0 0 0 1px rgba(34,197,94,0.1), 0 8px 32px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
    }}>

      {/* Accordion header — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '22px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderBottom: isOpen ? `1px solid ${S.border}` : 'none',
          transition: 'border-color 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
          <span style={{ fontSize: 28 }}>{platformIcon}</span>
          <div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: isOpen ? S.green : S.text,
              transition: 'color 0.2s ease',
              letterSpacing: '-0.3px',
            }}>
              {label}
            </div>
            <div style={{ fontSize: 12, color: S.dim, marginTop: 2 }}>{browserNote}</div>
          </div>
        </div>

        {/* Chevron */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: isOpen ? S.greenDim : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isOpen ? S.greenBorder : S.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.2s ease',
        }}>
          <span style={{
            fontSize: 13,
            color: isOpen ? S.green : S.dim,
            display: 'inline-block',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
            lineHeight: 1,
          }}>
            ▾
          </span>
        </div>
      </button>

      {/* Collapsible steps body */}
      <div style={{
        maxHeight: isOpen ? '800px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 0.35s ease',
      }}>
        <div style={{ padding: '28px 28px 32px' }}>

          {/* Step grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
          }}>
            {steps.map((step) => (
              <div key={step.number} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${S.border}`,
                borderRadius: 14,
                padding: '20px 18px',
                position: 'relative',
              }}>
                {/* Step number badge */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: S.green,
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                  boxShadow: '0 0 12px rgba(34,197,94,0.4)',
                }}>
                  {step.number}
                </div>

                {/* Icon */}
                <div style={{ fontSize: 26, marginBottom: 10 }}>{step.icon}</div>

                {/* Title */}
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: S.text,
                  marginBottom: 8,
                  letterSpacing: '-0.2px',
                }}>
                  {step.title}
                </div>

                {/* Detail */}
                <div style={{
                  fontSize: 12,
                  color: S.dim,
                  lineHeight: 1.6,
                }}>
                  {step.detail}
                </div>
              </div>
            ))}
          </div>

          {/* Browser tip callout */}
          <div style={{
            marginTop: 20,
            padding: '12px 16px',
            background: S.greenDim,
            border: `1px solid ${S.greenBorder}`,
            borderRadius: 10,
            fontSize: 12,
            color: S.dimBright,
            lineHeight: 1.5,
          }}>
            <span style={{ color: S.green, fontWeight: 700 }}>💡 Tip: </span>
            {isAndroid
              ? 'Make sure you\'re using Google Chrome. Other Android browsers may not support PWA installation.'
              : 'Make sure you\'re using Safari. iOS 16.4+ also supports installation from Chrome or Edge, but Safari is most reliable.'
            }
          </div>
        </div>
      </div>
    </div>
  );
}
```

### InstallSection wrapper

```tsx
function InstallSection({ detectedPlatform }: { detectedPlatform: Platform }) {
  const [openPanel, setOpenPanel] = useState<'android' | 'ios' | null>(null);

  // Auto-open the detected platform once we know it
  useEffect(() => {
    if (detectedPlatform === 'ios') setOpenPanel('ios');
    else setOpenPanel('android'); // android or unknown
  }, [detectedPlatform]);

  const toggle = (platform: 'android' | 'ios') => {
    setOpenPanel(prev => prev === platform ? null : platform);
  };

  return (
    <section style={{
      maxWidth: 860,
      margin: '0 auto',
      padding: '0 24px 64px',
    }}>
      {/* Section header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 36px)',
          fontWeight: 800,
          color: S.text,
          letterSpacing: '-0.5px',
          marginBottom: 8,
        }}>
          Install on Your Device
        </h2>
        <p style={{ fontSize: 15, color: S.dim }}>
          Choose your device and follow the steps below.
        </p>
      </div>

      {/* Platform cards — stacked, one open at a time */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PlatformCard
          platform="android"
          isOpen={openPanel === 'android'}
          onToggle={() => toggle('android')}
        />
        <PlatformCard
          platform="ios"
          isOpen={openPanel === 'ios'}
          onToggle={() => toggle('ios')}
        />
      </div>
    </section>
  );
}
```

---

## Section 3: Manage Your App

```tsx
function ManageSection() {
  const cards = [
    {
      icon: '🔄',
      iconBg: 'rgba(34,197,94,0.12)',
      iconBorder: 'rgba(34,197,94,0.25)',
      title: 'How to Update',
      color: '#22c55e',
      body: 'SitRep updates automatically in the background whenever we release improvements. Just launch the app to get the latest version.',
      badge: 'No action needed!',
      badgeColor: '#22c55e',
    },
    {
      icon: '✏️',
      iconBg: 'rgba(99,102,241,0.12)',
      iconBorder: 'rgba(99,102,241,0.25)',
      title: 'Edit Shortcuts',
      color: '#6366f1',
      body: 'Rename or move the app icon like any other app on your device.',
      bullets: [
        'Press and hold the icon',
        'Tap "Edit Home Screen" (iOS) or drag to reposition (Android)',
      ],
      badgeColor: '#6366f1',
    },
    {
      icon: '🗑️',
      iconBg: 'rgba(239,68,68,0.12)',
      iconBorder: 'rgba(239,68,68,0.25)',
      title: 'Remove SitRep',
      color: '#ef4444',
      body: null,
      bullets: [
        'Android: Press and hold the icon, then tap "Remove" or drag it to the trash.',
        'iOS: Press and hold the icon, tap "Remove App", then confirm.',
      ],
      badgeColor: '#ef4444',
    },
  ];

  return (
    <section style={{
      maxWidth: 860,
      margin: '0 auto',
      padding: '0 24px 80px',
    }}>
      {/* Divider */}
      <div style={{
        width: '100%',
        height: 1,
        background: S.border,
        marginBottom: 56,
      }} />

      {/* Section header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 36px)',
          fontWeight: 800,
          color: S.text,
          letterSpacing: '-0.5px',
          marginBottom: 8,
        }}>
          Manage Your App
        </h2>
        <p style={{ fontSize: 15, color: S.dim }}>
          Update, edit, or remove SitRep anytime.
        </p>
      </div>

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 20,
      }}>
        {cards.map((card) => (
          <div key={card.title} style={{
            background: S.card,
            border: `1px solid ${S.border}`,
            borderRadius: 18,
            padding: '24px 24px',
          }}>
            {/* Icon circle */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: card.iconBg,
              border: `1px solid ${card.iconBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              marginBottom: 16,
            }}>
              {card.icon}
            </div>

            {/* Title */}
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: card.color,
              marginBottom: 10,
            }}>
              {card.title}
            </div>

            {/* Body text */}
            {card.body && (
              <p style={{
                fontSize: 13,
                color: S.dimBright,
                lineHeight: 1.6,
                marginBottom: card.badge ? 14 : 0,
              }}>
                {card.body}
              </p>
            )}

            {/* Bullet list */}
            {card.bullets && (
              <ul style={{
                margin: 0,
                padding: '0 0 0 16px',
                fontSize: 13,
                color: S.dimBright,
                lineHeight: 1.7,
              }}>
                {card.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}

            {/* Badge */}
            {card.badge && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 12,
                fontSize: 11,
                fontWeight: 700,
                color: card.badgeColor,
                background: `${card.badgeColor}18`,
                border: `1px solid ${card.badgeColor}33`,
                borderRadius: 20,
                padding: '3px 10px',
              }}>
                ✓ {card.badge}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

---

## Section 4: Footer

```tsx
function Footer() {
  return (
    <footer style={{
      borderTop: `1px solid ${S.border}`,
      padding: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      maxWidth: 860,
      margin: '0 auto',
    }}>
      {/* Logo + tagline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="9" fill="#22c55e" />
          <rect x="8" y="10" width="20" height="18" rx="3" stroke="white" strokeWidth="2" fill="none"/>
          <line x1="8" y1="15" x2="28" y2="15" stroke="white" strokeWidth="2"/>
          <line x1="13" y1="8" x2="13" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1="23" y1="8" x2="23" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 14, fontWeight: 700, color: S.text }}>SitRep</span>
        <span style={{ fontSize: 12, color: S.dim }}>Task management & calendar for teams in the field.</span>
      </div>

      {/* Copyright */}
      <span style={{ fontSize: 12, color: S.dim }}>
        © {new Date().getFullYear()} SitRep. All rights reserved.
      </span>
    </footer>
  );
}
```

---

## Root Component — DownloadClient

```tsx
export default function DownloadClient() {
  const detectedPlatform = useDetectedPlatform();

  return (
    <div
      className={dmSans.className}
      style={{
        minHeight: '100vh',
        background: S.bg,
        color: S.text,
      }}
    >
      {/* Subtle top gradient accent */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        height: '300px',
        background: 'radial-gradient(ellipse at top, rgba(34,197,94,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <HeroSection />
        <InstallSection detectedPlatform={detectedPlatform} />
        <ManageSection />
        <Footer />
      </div>
    </div>
  );
}
```

---

## Global CSS Requirements

If `apps/sitrep-pwa` has a `globals.css`, ensure it has at minimum:

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  background: rgb(10, 13, 20);
  color: rgb(236, 240, 245);
}

button {
  font-family: inherit;
}

ul, li {
  list-style-type: disc;
}
```

---

## PWA Manifest Notes

The `/download` page is not the manifest itself — the manifest should live at `public/manifest.json` in the `sitrep-pwa` app and be linked in the root `layout.tsx`:

```tsx
// apps/sitrep-pwa/app/layout.tsx
export const metadata = {
  manifest: '/manifest.json',
};
```

The `/download` page simply instructs users how to install. The actual PWA installability comes from the manifest being present and valid on the domain. Make sure `manifest.json` exists and is linked before this page goes live, otherwise the Chrome automatic install banner (mentioned in the Android steps) won't appear.

---

## Implementation Checklist for Claude Code

- [ ] Create `apps/sitrep-pwa/app/download/page.tsx` (server shell with metadata)
- [ ] Create `apps/sitrep-pwa/app/download/DownloadClient.tsx` with all components from this spec
- [ ] Import `DM_Sans` from `next/font/google` — ensure `next` is on a version that supports this (Next 13+)
- [ ] Confirm `globals.css` has the base resets above — add if missing, do not overwrite existing rules
- [ ] Confirm `public/manifest.json` exists — if not, flag it as needed before this page is useful
- [ ] No additional npm packages needed — everything is inline styles + Next.js built-ins
- [ ] The `useDetectedPlatform` hook uses `useEffect` so it runs client-side only — no SSR mismatch issues
- [ ] `InstallSection` uses its own `useEffect` to sync open panel with detected platform — this is correct and intentional
