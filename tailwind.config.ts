import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Noto Sans",
          "sans-serif",
        ],
      },
      colors: {
        // Single accent + shared risk palette (design tokens).
        accent: { DEFAULT: "#0ea5e9", 600: "#0284c7" },
        risk: {
          low: "#22c55e",
          moderate: "#eab308",
          high: "#f97316",
          severe: "#dc2626",
        },
      },
      boxShadow: {
        sheet: "0 -8px 30px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;
