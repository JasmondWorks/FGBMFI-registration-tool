// Keeps the browser PDF worker in /public in step with the installed pdfjs-dist version.
import { copyFileSync, existsSync } from "node:fs";

const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src)) copyFileSync(src, "public/pdf.worker.min.mjs");
