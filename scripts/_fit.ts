import fs from "node:fs";
import { buildSheetsPdf } from "@/server/sheet-pdf";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/types";
const b = new Uint8Array(fs.readFileSync("/mnt/user-data/uploads/732a3af9-FGBMFI_Badge_A6_IBEKWE_ETHEL_2026-11-12_121659.pdf"));
const slots = [1,2,3,4].map(slot => ({ slot, bytes: b, mime: "application/pdf" }));
const pdf = await buildSheetsPdf([{ slots }], { ...DEFAULT_PRINT_SETTINGS, printTemplate: true, cutMarks: true });
fs.writeFileSync("/tmp/fit.pdf", pdf);
const plain = await buildSheetsPdf([{ slots }], DEFAULT_PRINT_SETTINGS);
fs.writeFileSync("/tmp/plain.pdf", plain);
