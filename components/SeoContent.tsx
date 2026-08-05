/**
 * Server-rendered SEO + accessibility content. The app itself is a full-screen
 * interactive map (little crawlable text), which is why Google marked it
 * "crawled – currently not indexed". This block gives search engines — and
 * screen-reader users who can't use the visual map — a real, accurate
 * description of the service. It is genuine content, not keyword stuffing.
 *
 * Rendered visually-hidden (`sr-only`) so it doesn't disturb the map UI, but it
 * is present in the server HTML and fully indexable.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://assamfloodwatch.com";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "Assam Flood Watch",
      alternateName: "অসম বান নিৰীক্ষণ",
      description:
        "Real-time flood risk map for all 33 districts of Assam, India — rainfall and river-discharge modelled estimates, in English and Assamese.",
      inLanguage: ["en", "as"],
    },
    {
      "@type": "WebApplication",
      name: "Assam Flood Watch",
      url: SITE,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires a modern web browser",
      inLanguage: ["en", "as"],
      description:
        "Free public-information flood dashboard for Assam: district flood risk, 72-hour rainfall, river gauge levels, a community help board and emergency helplines. Informational only — follow ASDMA and CWC for official warnings.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
  ],
};

export default function SeoContent() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="sr-only" aria-label="About Assam Flood Watch">
        <h2>Assam Flood Watch — real-time flood risk map for Assam (অসম বান নিৰীক্ষণ)</h2>
        <p>
          Assam Flood Watch is a free, mobile-first flood-information dashboard for all 33 districts of
          Assam, India. It shows district-level flood risk, observed and forecast rainfall, river gauge
          water levels versus danger level, modelled river discharge, and emergency helplines — in both
          English and Assamese (বান / flood, বিপদ সীমা / danger level).
        </p>
        <h3>Districts covered</h3>
        <p>
          All 33 districts of Assam, including Barpeta, Dhubri, South Salmara-Mankachar, Goalpara, Bongaigaon,
          Chirang, Kokrajhar, Baksa, Nalbari, Kamrup, Kamrup Metropolitan, Darrang, Udalguri, Sonitpur,
          Biswanath, Nagaon, Hojai, Morigaon, Lakhimpur, Dhemaji, Majuli, Jorhat, Golaghat, Sivasagar,
          Charaideo, Dibrugarh, Tinsukia, Karbi Anglong, West Karbi Anglong, Dima Hasao, Cachar, Hailakandi
          and Karimganj. Search your town or use your location to see the nearest rivers and gauges.
        </p>
        <h3>Community help board</h3>
        <p>
          People affected by floods can post a request for help — rescue, boat, medical aid, food, drinking
          water or shelter — with their location and contact, and volunteers nearby can offer help. This is a
          community feature and not an official rescue service.
        </p>
        <h3>Data sources</h3>
        <p>
          Rainfall and river discharge from Open-Meteo and GloFAS; gauge danger levels referenced from CWC.
          Official flood bulletins come from ASDMA (Assam State Disaster Management Authority). All figures are
          modelled estimates for public information only and are not official warnings.
        </p>
        <h3>Emergency helplines</h3>
        <p>
          State helpline 1079, district control room 1077, NDRF 9711077372. In an emergency, always follow
          ASDMA, CWC and your district administration.
        </p>
      </section>
    </>
  );
}
