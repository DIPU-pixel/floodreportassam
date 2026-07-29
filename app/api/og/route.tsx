import { ImageResponse } from "next/og";

/**
 * Social share card (1200×630). Static, brand-only — never renders live risk
 * numbers, so a shared link can't be mistaken for an official, dated warning.
 * GET /api/og
 */
export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0b1220 0%, #0f172a 55%, #1e3a8a 100%)",
          color: "#f8fafc",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 76 }}>🌊</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05 }}>Assam Flood Watch</div>
            <div style={{ fontSize: 34, color: "#bae6fd" }}>অসম বান নিৰীক্ষণ</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 600, color: "#e2e8f0" }}>
            Flood risk for all 33 districts of Assam
          </div>
          <div style={{ fontSize: 28, color: "#94a3b8" }}>
            Modelled from live rainfall &amp; river discharge · Open-Meteo
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#cbd5e1",
            borderTop: "2px solid #334155",
            paddingTop: 20,
          }}
        >
          Informational only — for official warnings follow ASDMA / CWC / district administration.
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
