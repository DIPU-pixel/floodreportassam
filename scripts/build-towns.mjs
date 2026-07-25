/**
 * Build public/data/towns.json from a master list of Assam towns.
 *
 *   node scripts/build-towns.mjs
 *
 * Each town's districtId is assigned by point-in-polygon against the CURRENT
 * public/data/assam_districts.geojson (the authoritative check the spec asks
 * for). Towns that fall outside every polygon are reported and snapped to the
 * nearest district centroid so nothing is silently dropped — fix their
 * coordinates if any are reported.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const districts = JSON.parse(
  await readFile(path.join(ROOT, "public", "data", "assam_districts.geojson"), "utf8")
);

// name, lat, lng — district is derived below.
const MASTER = [
  ["Dhemaji", 27.48, 94.58], ["Silapathar", 27.30, 94.55], ["Gogamukh", 27.20, 94.30],
  ["North Lakhimpur", 27.23, 94.10], ["Bihpuria", 27.02, 93.85], ["Narayanpur", 27.00, 93.83], ["Dhakuakhana", 27.45, 94.35], ["Jonai", 27.80, 94.95],
  ["Garamur", 26.95, 94.17], ["Kamalabari", 26.93, 94.20], ["Jengraimukh", 26.98, 94.10],
  ["Biswanath Chariali", 26.72, 93.15], ["Gohpur", 26.88, 93.62], ["Behali", 26.80, 93.45],
  ["Tezpur", 26.63, 92.80], ["Rangapara", 26.83, 92.66], ["Dhekiajuli", 26.70, 92.48], ["Balipara", 26.83, 92.77],
  ["Udalguri", 26.75, 92.10], ["Tangla", 26.63, 92.13], ["Kalaigaon", 26.55, 92.20], ["Rowta", 26.68, 92.02],
  ["Mangaldoi", 26.44, 92.03], ["Sipajhar", 26.50, 92.10], ["Kharupetia", 26.52, 92.15], ["Dalgaon", 26.42, 92.20],
  ["Mushalpur", 26.66, 91.30], ["Tamulpur", 26.65, 91.55], ["Barama", 26.48, 91.30], ["Salbari", 26.70, 91.20],
  ["Nalbari", 26.44, 91.44], ["Mukalmua", 26.35, 91.30], ["Tihu", 26.44, 91.25], ["Ghograpar", 26.30, 91.45],
  ["Barpeta", 26.32, 91.00], ["Barpeta Road", 26.50, 90.97], ["Howly", 26.42, 90.98], ["Sarthebari", 26.30, 91.15], ["Sarbhog", 26.42, 90.90],
  ["Bongaigaon", 26.48, 90.55], ["Abhayapuri", 26.32, 90.68], ["North Salmara", 26.30, 90.62], ["Manikpur", 26.50, 90.62],
  ["Kajalgaon", 26.55, 90.62], ["Bijni", 26.50, 90.70], ["Basugaon", 26.55, 90.42], ["Bengtol", 26.55, 90.30],
  ["Kokrajhar", 26.40, 90.27], ["Gossaigaon", 26.45, 89.98], ["Dotma", 26.48, 90.20], ["Kachugaon", 26.42, 89.90], ["Fakiragram", 26.42, 90.20],
  ["Dhubri", 26.02, 89.98], ["Bilasipara", 26.23, 90.23], ["Gauripur", 26.08, 89.96], ["Golakganj", 26.10, 89.85], ["Chapar", 26.27, 90.30],
  ["Hatsingimari", 25.92, 89.92], ["Mankachar", 25.53, 89.87], ["South Salmara", 25.88, 89.90], ["Sukchar", 25.60, 89.90],
  ["Goalpara", 26.17, 90.62], ["Dudhnoi", 25.98, 90.78], ["Lakhipur (Goalpara)", 26.02, 90.28], ["Krishnai", 26.10, 90.66], ["Agia", 26.13, 90.55],
  ["Amingaon", 26.20, 91.68], ["Rangia", 26.45, 91.60], ["Hajo", 26.25, 91.53], ["Chhaygaon", 26.05, 91.35], ["Boko", 26.02, 91.23], ["Palashbari", 26.13, 91.55], ["Nagarbera", 26.15, 91.10],
  ["Guwahati", 26.14, 91.74], ["Dispur", 26.14, 91.79], ["North Guwahati", 26.22, 91.72], ["Sonapur", 26.13, 92.02],
  ["Morigaon", 26.25, 92.34], ["Jagiroad", 26.15, 92.35], ["Laharighat", 26.30, 92.55], ["Mayong", 26.24, 92.40], ["Bhuragaon", 26.35, 92.50],
  ["Nagaon", 26.35, 92.68], ["Kaliabor", 26.55, 92.88], ["Raha", 26.25, 92.52], ["Dhing", 26.47, 92.47], ["Kampur", 26.10, 92.75], ["Samaguri", 26.42, 92.90],
  ["Hojai", 26.00, 92.85], ["Lumding", 25.75, 93.17], ["Doboka", 26.05, 92.90], ["Jamunamukh", 26.07, 92.83], ["Lanka", 25.88, 93.00],
  ["Golaghat", 26.52, 93.96], ["Bokakhat", 26.64, 93.60], ["Sarupathar", 26.15, 93.98], ["Dergaon", 26.70, 93.95], ["Numaligarh", 26.62, 93.72], ["Furkating", 26.55, 93.90],
  ["Jorhat", 26.75, 94.22], ["Titabar", 26.60, 94.20], ["Mariani", 26.65, 94.32], ["Teok", 26.72, 94.45],
  ["Sivasagar", 26.98, 94.63], ["Nazira", 26.92, 94.74], ["Simaluguri", 26.95, 94.72], ["Amguri", 26.85, 94.55], ["Demow", 27.03, 94.60], ["Gaurisagar", 26.90, 94.55],
  ["Sonari", 27.02, 95.02], ["Sapekhati", 27.10, 95.10], ["Mahmora", 27.08, 95.00],
  ["Dibrugarh", 27.48, 94.91], ["Naharkatia", 27.30, 95.33], ["Chabua", 27.48, 95.17], ["Tingkhong", 27.38, 95.05], ["Duliajan", 27.37, 95.32], ["Tengakhat", 27.55, 95.10], ["Moran", 27.18, 94.92],
  ["Tinsukia", 27.49, 95.36], ["Digboi", 27.39, 95.62], ["Margherita", 27.28, 95.68], ["Doomdooma", 27.57, 95.55], ["Makum", 27.48, 95.43], ["Sadiya", 27.83, 95.67], ["Ledo", 27.30, 95.72],
  ["Diphu", 25.84, 93.43], ["Bokajan", 26.02, 93.78], ["Howraghat", 26.05, 93.30], ["Dokmoka", 26.10, 93.15],
  ["Hamren", 25.95, 92.55], ["Donkamokam", 25.90, 92.75], ["Baithalangso", 25.88, 92.62],
  ["Haflong", 25.16, 93.02], ["Maibang", 25.30, 93.13], ["Umrangso", 25.55, 92.70], ["Mahur", 25.28, 93.10],
  ["Silchar", 24.82, 92.80], ["Lakhipur (Cachar)", 24.80, 93.00], ["Sonai", 24.75, 92.90], ["Katigorah", 24.75, 92.65], ["Udharbond", 24.87, 92.86],
  ["Karimganj", 24.87, 92.35], ["Badarpur", 24.87, 92.60], ["Ramkrishna Nagar", 24.68, 92.40], ["Patharkandi", 24.63, 92.22], ["Nilambazar", 24.75, 92.30],
  ["Hailakandi", 24.68, 92.56], ["Lala", 24.55, 92.60], ["Katlicherra", 24.62, 92.50], ["Algapur", 24.72, 92.60],
];

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(lng, lat, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) {
    let inside = false;
    for (const ring of rings) if (pointInRing(lng, lat, ring)) inside = !inside;
    if (inside) return true;
  }
  return false;
}
function districtAt(lng, lat) {
  for (const f of districts.features) if (pointInGeom(lng, lat, f.geometry)) return f.properties;
  return null;
}
function nearestDistrict(lng, lat) {
  let best = null;
  let bestD = Infinity;
  for (const f of districts.features) {
    const d = (f.properties.centroidLat - lat) ** 2 + (f.properties.centroidLng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = f.properties;
    }
  }
  return best;
}

const towns = [];
const outside = [];
for (const [name, lat, lng] of MASTER) {
  let d = districtAt(lng, lat);
  if (!d) {
    d = nearestDistrict(lng, lat);
    outside.push(`${name} (snapped → ${d.name})`);
  }
  towns.push({ name, districtId: d.id, lat, lng });
}

towns.sort((a, b) => a.districtId.localeCompare(b.districtId) || a.name.localeCompare(b.name));
await writeFile(path.join(ROOT, "public", "data", "towns.json"), JSON.stringify(towns, null, 0));

const covered = new Set(towns.map((t) => t.districtId));
const missing = districts.features.map((f) => f.properties.id).filter((id) => !covered.has(id));
console.log(`✓ towns.json: ${towns.length} towns across ${covered.size}/${districts.features.length} districts`);
if (outside.length) console.warn(`  ⚠ ${outside.length} outside any polygon (snapped): ${outside.join("; ")}`);
if (missing.length) console.warn(`  ⚠ districts with no town: ${missing.join(", ")}`);
