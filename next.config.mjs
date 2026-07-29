/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gzip the HTML + JS/CSS responses (matters on slow 4G).
  compress: true,
  poweredByHeader: false,
  // web-push uses dynamic requires — keep it as a runtime Node dependency
  // instead of bundling it, so the API route builds cleanly.
  experimental: { serverComponentsExternalPackages: ["web-push"] },
};
export default nextConfig;
