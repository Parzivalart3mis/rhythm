import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  applicationName: "Rhythm",
  title: "Rhythm",
  description: "One schedule, three views, reminders that actually fire.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rhythm",
  },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// [cssWidth, cssHeight, devicePixelRatio] for every iPhone still on a supported
// iOS. An unmatched device shows a blank white rectangle on launch instead of
// the splash. Mirrors DEVICES in scripts/generate-assets.mjs — change both.
const SPLASH_DEVICES: ReadonlyArray<readonly [number, number, number]> = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 16 Plus, 15 Pro Max, 14 Pro Max
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [428, 926, 3], // 14 Plus, 13 Pro Max, 12 Pro Max
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [360, 780, 3], // 13 mini, 12 mini
  [375, 812, 3], // 11 Pro, XS, X
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE (2nd/3rd gen), 8
];

export const viewport: Viewport = {
  themeColor: "#4C5FD5",
  width: "device-width",
  initialScale: 1,
  // Zoom stays enabled: the week grid renders at 10px and has to be
  // magnifiable. The iOS focus-zoom this is usually pinned to prevent is
  // already handled by 16px form controls.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className="h-full">
        <head>
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          {SPLASH_DEVICES.flatMap(([cssW, cssH, dpr]) => {
            const px = `${cssW * dpr}x${cssH * dpr}`;
            const device =
              `screen and (device-width: ${cssW}px) and (device-height: ${cssH}px)` +
              ` and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`;
            // Dark first: a device that doesn't understand prefers-color-scheme
            // simply falls through to the light image below it.
            return [
              <link
                key={`${px}-dark`}
                rel="apple-touch-startup-image"
                href={`/splash/splash-${px}-dark.png`}
                media={`(prefers-color-scheme: dark) and ${device}`}
              />,
              <link
                key={px}
                rel="apple-touch-startup-image"
                href={`/splash/splash-${px}.png`}
                media={device}
              />,
            ];
          })}
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-full antialiased`}
        >
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
