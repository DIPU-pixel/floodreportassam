import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/Toast";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const DESCRIPTION =
  "Real-time flood risk map for all districts of Assam — rainfall-driven modelled estimates. Informational only; follow ASDMA / CWC for official warnings.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Assam Flood Watch | অসম বান নিৰীক্ষণ",
  description: DESCRIPTION,
  applicationName: "Assam Flood Watch",
  manifest: "/manifest.webmanifest",
  keywords: [
    "Assam flood",
    "Assam flood map",
    "Assam flood watch",
    "flood alert Assam",
    "Brahmaputra flood",
    "ASDMA",
    "CWC flood",
    "অসম বান",
    "বান নিৰীক্ষণ",
    "Assam flood help",
    "flood rescue Assam",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  // Set NEXT_PUBLIC_GOOGLE_VERIFICATION in Vercel to the token Google Search
  // Console gives you (the "HTML tag" method) to verify ownership.
  verification: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION }
    : undefined,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  appleWebApp: {
    capable: true,
    title: "Flood Watch",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    title: "Assam Flood Watch | অসম বান নিৰীক্ষণ",
    description: DESCRIPTION,
    siteName: "Assam Flood Watch",
    url: "/",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Assam Flood Watch" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Assam Flood Watch | অসম বান নিৰীক্ষণ",
    description: DESCRIPTION,
    images: ["/api/og"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Warm up the connections the map + data feeds will need, so the first
            tile/fetch doesn't also pay DNS + TLS on slow 4G. */}
        <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://server.arcgisonline.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.open-meteo.com" />
        <link rel="dns-prefetch" href="https://flood-api.open-meteo.com" />
        <link rel="dns-prefetch" href="https://geocoding-api.open-meteo.com" />
      </head>
      <body className="h-dvh w-full overflow-hidden overscroll-none bg-slate-950 text-slate-100 antialiased">
        <LanguageProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
