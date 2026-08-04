import type { Metadata } from "next";

// Keep the admin panel out of search engines.
export const metadata: Metadata = {
  title: "Admin · Assam Flood Watch",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
