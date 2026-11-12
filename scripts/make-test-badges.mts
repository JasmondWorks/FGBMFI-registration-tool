/**
 * Generates fake FGBMFI badges in the platform's format for testing (same A6 size,
 * same layout, same filename pattern). Usage: npx tsx scripts/make-test-badges.mts <outDir> [count]
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PEOPLE: [string, string, string, string][] = [
  // [badge name line, filename name, district, chapter]
  ["MR ANTHONY MADUGBA", "Anthony_Madugba", "Lagos Central", "Ikeja"],
  ["ELDER AMB. MR JOHN OKAFOR", "John_Okafor", "South East 1", "Umidim Nnewi"],
  ["MRS GRACE ADEYEMI", "Grace_Adeyemi", "Lagos Central", "Surulere"],
  ["DR (MRS) NGOZI EZE", "Ngozi_Eze", "South East 2", "Enugu Main"],
  ["PASTOR EMEKA OBI KSM", "Emeka_Obi", "South East 1", "Onitsha"],
  ["MR PRINCE OKORO", "Prince_Okoro", "South South", "Port Harcourt"],
  ["CHIEF HON. BOLA TINUBU-ADE", "Bola_Tinubu-Ade", "Lagos West", "Badagry"],
  ["DEACONESS FUNKE AKINDELE", "Funke_Akindele", "Lagos West", "Ojo"],
  ["ENGR SAMUEL ADEBAYO", "Samuel_Adebayo", "Lagos Central", "Ikeja"],
  ["MRS IFEOMA NWOSU", "Ifeoma_Nwosu", "South East 2", "Enugu Main"],
  ["BARR. TUNDE BAKARE", "Tunde_Bakare", "Lagos Central", "Yaba"],
  ["MR CHIDI OKEKE", "Chidi_Okeke", "South East 1", "Awka"],
  ["MRS BLESSING OKON", "Blessing_Okon", "South South", "Uyo"],
  ["PROF. MR KUNLE OLA", "Kunle_Ola", "South West", "Ibadan"],
  ["MR DAVID MARK", "David_Mark", "North Central", "Abuja Central"],
  ["MRS AISHA BELLO", "Aisha_Bello", "North Central", "Abuja Central"],
  ["MR PETER OBI", "Peter_Obi", "South East 1", "Onitsha"],
  ["MRS JOY EKPO", "Joy_Ekpo", "South South", "Calabar"],
];

async function badge(nameLine: string, district: string, chapter: string, id: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([297.6377952755906, 419.52755905511816]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.06, 0.09, 0.16);
  const w = bold.widthOfTextAtSize(nameLine, 13);
  for (const dx of [0, 0.18, 0.36]) page.drawText(nameLine, { x: (297.64 - w) / 2 + dx, y: 193.58, size: 13, font: bold, color: ink });
  const label = rgb(0.4, 0.45, 0.6);
  page.drawText("District:", { x: 22.7, y: 126.7, size: 7, font: bold, color: label });
  page.drawText(district, { x: 50.8, y: 126.7, size: 8, font: reg, color: ink });
  page.drawText("Chapter:", { x: 22.7, y: 114.7, size: 8, font: bold, color: label });
  page.drawText(chapter, { x: 57.5, y: 114.7, size: 9, font: reg, color: ink });
  page.drawText("ID:", { x: 22.7, y: 101.2, size: 6.5, font: bold, color: label });
  page.drawText(id, { x: 32.9, y: 101.2, size: 7.5, font: reg, color: ink });
  // QR-ish block in the same place as the real badge
  for (let r = 0; r < 25; r++)
    for (let c = 0; c < 25; c++)
      if ((r * 7 + c * 13 + id.charCodeAt((r + c) % id.length)) % 3 === 0)
        page.drawRectangle({ x: 181.4 + c * 2.93, y: 80 + r * 2.93, width: 2.93, height: 2.93, color: rgb(0.12, 0.16, 0.22) });
  return doc.save();
}

const out = process.argv[2] ?? "./test-badges";
const count = Number(process.argv[3] ?? PEOPLE.length);
fs.mkdirSync(out, { recursive: true });
for (let i = 0; i < count; i++) {
  const [line, file, district, chapter] = PEOPLE[i % PEOPLE.length];
  const id = `CON2611${String(1000000 + i * 7919).slice(-7)}${(i * 2654435761 >>> 0).toString(16).padStart(8, "0").slice(0, 10)}`;
  const bytes = await badge(line, district, chapter, id);
  const t = `12${String(10 + (i % 50)).padStart(2, "0")}${String(i % 60).padStart(2, "0")}`;
  fs.writeFileSync(path.join(out, `FGBMFI_Badge_A6_${file}_2026-11-12_${t}.pdf`), bytes);
}
console.log(`Wrote ${count} badges to ${out}`);
