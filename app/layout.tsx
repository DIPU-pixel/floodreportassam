import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assam Flood Watch | অসম বান নিৰীক্ষণ",
  description:
    "Real-time flood risk map for all districts of Assam — rainfall-driven modelled estimates. Informational only; follow ASDMA / CWC for official warnings.",
  manifest: "/manifest.webmanifest",
  applicationName: "Assam Flood Watch",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  appleWebApp: {
    capable: true,
    title: "Flood Watch",
    statusBarStyle: "black-translucent",
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
      <body className="h-dvh w-full overflow-hidden overscroll-none bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
