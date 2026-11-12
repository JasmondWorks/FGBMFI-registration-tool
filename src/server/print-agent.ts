import "server-only";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Direct printing: the app sends each sheet straight to the printer through the
 * operating system and then reads the print queue, so we know the job actually
 * reached the printer and finished spooling. This works because the app runs on the
 * laptop that's connected to the printer.
 *
 * The spooler cannot see paper jams or misprints, which is why the operator still
 * confirms every sheet afterwards. Final truth = spooled + operator confirmed.
 *
 *   Windows        pdf-to-printer (bundled SumatraPDF) + PowerShell Get-PrintJob
 *   macOS / Linux  CUPS: lp to print, lpstat to read the queue
 */

const run = promisify(execFile);
const isWindows = process.platform === "win32";

export type PrinterInfo = { name: string; isDefault: boolean };
export type SpoolStatus = "QUEUED" | "PRINTING" | "COMPLETED" | "ERROR" | "UNKNOWN";

export async function listPrinters(): Promise<PrinterInfo[]> {
  if (isWindows) {
    const ptp = await import("pdf-to-printer");
    const [printers, def] = await Promise.all([ptp.getPrinters(), ptp.getDefaultPrinter().catch(() => null)]);
    return printers.map((p) => ({ name: p.name, isDefault: p.name === def?.name }));
  }
  try {
    const [{ stdout: list }, def] = await Promise.all([
      run("lpstat", ["-e"]),
      run("lpstat", ["-d"]).catch(() => ({ stdout: "" })),
    ]);
    const defaultName = def.stdout.split(":").pop()?.trim() ?? "";
    return list
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((name) => ({ name, isDefault: name === defaultName }));
  } catch {
    return [];
  }
}

/** Sends one PDF to the printer and returns the spooler's job id. */
export async function printPdf(pdf: Uint8Array, printerName: string, title: string): Promise<string> {
  const file = path.join(os.tmpdir(), `namecard-${randomUUID()}.pdf`);
  await fs.writeFile(file, pdf);
  try {
    if (isWindows) return await printWindows(file, printerName, title);
    // -o fit-to-page=false and media=A4 keep the sheet at actual size. sides=one-sided is
    // required: the card stock is pre-printed on one side only, so if the printer's own
    // default is double-sided, a 2-page job would print page 2 on the back of page 1's
    // sheet instead of a fresh sheet.
    const { stdout } = await run("lp", [
      "-d",
      printerName,
      "-t",
      title,
      "-o",
      "media=A4",
      "-o",
      "fit-to-page=false",
      "-o",
      "print-scaling=none",
      "-o",
      "sides=one-sided",
      file,
    ]);
    const match = stdout.match(/request id is (\S+)/);
    if (!match) throw new Error(`Printer didn't return a job id: ${stdout.trim()}`);
    return match[1];
  } finally {
    // CUPS copies the file when it accepts the job; Windows needs it until Sumatra is done.
    setTimeout(() => fs.rm(file, { force: true }).catch(() => undefined), 60_000);
  }
}

async function printWindows(file: string, printerName: string, title: string) {
  const ptp = await import("pdf-to-printer");
  const before = await windowsJobIds(printerName);
  // side: "simplex" forces one-sided, same reasoning as sides=one-sided on CUPS above.
  await ptp.print(file, { printer: printerName, scale: "noscale", paperSize: "A4", side: "simplex", silent: true });
  // Find the job that appeared after we printed.
  for (let i = 0; i < 10; i++) {
    const after = await windowsJobIds(printerName);
    const added = after.filter((id) => !before.includes(id));
    if (added.length) return `${printerName}#${added[added.length - 1]}`;
    await new Promise((r) => setTimeout(r, 300));
  }
  // The job may have spooled and finished before we looked, which is fine.
  return `${printerName}#done-${title}`;
}

async function windowsJobIds(printerName: string): Promise<string[]> {
  try {
    const { stdout } = await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-PrintJob -PrinterName '${printerName.replace(/'/g, "''")}' | Select-Object -ExpandProperty Id`,
    ]);
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Reads the print queue for one job. A job that has left the queue without an error is COMPLETED. */
export async function getSpoolStatus(spoolerJobId: string): Promise<SpoolStatus> {
  if (isWindows) {
    const [printer, id] = spoolerJobId.split("#");
    if (!id || id.startsWith("done-")) return "COMPLETED";
    try {
      const { stdout } = await run("powershell.exe", [
        "-NoProfile",
        "-Command",
        `$j = Get-PrintJob -PrinterName '${printer.replace(/'/g, "''")}' -ID ${Number(id)} -ErrorAction SilentlyContinue; if ($j) { $j.JobStatus } else { 'GONE' }`,
      ]);
      const s = stdout.trim().toLowerCase();
      if (s === "gone") return "COMPLETED";
      if (s.includes("error") || s.includes("offline") || s.includes("paperout")) return "ERROR";
      if (s.includes("printing") || s.includes("spooling")) return "PRINTING";
      return "QUEUED";
    } catch {
      return "UNKNOWN";
    }
  }
  try {
    const { stdout: done } = await run("lpstat", ["-W", "completed", "-o"]);
    if (done.split("\n").some((l) => l.startsWith(spoolerJobId + " "))) return "COMPLETED";
    const { stdout: active } = await run("lpstat", ["-o"]);
    if (active.split("\n").some((l) => l.startsWith(spoolerJobId + " "))) return "QUEUED";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
