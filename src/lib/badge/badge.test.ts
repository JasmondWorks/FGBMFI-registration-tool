import { describe, expect, it } from "vitest";

import { parseBadgeFilename } from "./filename";
import { canonicalLabel, canonicalName, canonicalTitle, nameKey, namesMatch, normalizeText } from "./normalize";
import { parseBadgeLines } from "./parse-text";
import { splitTitles } from "./titles";
import { checkCount, chunkIntoPages } from "../paging";

describe("parseBadgeFilename", () => {
  it("parses the platform format", () => {
    const r = parseBadgeFilename("FGBMFI_Badge_A6_Anthony_Madugba_2026-11-12_120119.pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.org).toBe("FGBMFI");
    expect(r.size).toBe("A6");
    expect(r.nameFromFile).toBe("Anthony Madugba");
    expect(r.generatedAt.toISOString()).toBe("2026-11-12T11:01:19.000Z"); // 12:01:19 WAT
  });

  it("handles 3 and 4 part names and hyphens", () => {
    const a = parseBadgeFilename("FGBMFI_Badge_A6_Mary_Ann_Okafor_2026-11-12_090000.pdf");
    const b = parseBadgeFilename("FGBMFI_Badge_A6_John_Paul_Ade-Bello_Smith_2026-11-12_090000.pdf");
    expect(a.ok && a.nameFromFile).toBe("Mary Ann Okafor");
    expect(b.ok && b.nameFromFile).toBe("John Paul Ade-Bello Smith");
  });

  it("strips browser duplicate suffixes and leading prefixes", () => {
    const r = parseBadgeFilename("732a3af9-FGBMFI_Badge_A6_IBEKWE_ETHEL_2026-11-12_121659 (1).pdf");
    expect(r.ok && r.nameFromFile).toBe("IBEKWE ETHEL");
  });

  it("rejects other files and bad dates", () => {
    expect(parseBadgeFilename("scan001.pdf").ok).toBe(false);
    expect(parseBadgeFilename("FGBMFI_Badge_A6_Jane_Doe_2026-13-45_250000.pdf").ok).toBe(false);
  });

  it("reports non-A6 sizes as parsed so the caller can warn", () => {
    const r = parseBadgeFilename("FGBMFI_Badge_A5_Jane_Doe_2026-11-12_090000.pdf");
    expect(r.ok && r.size).toBe("A5");
  });
});

describe("splitTitles", () => {
  it("uses the filename name as an anchor", () => {
    const r = splitTitles("MRS IBEKWE ETHEL", "IBEKWE ETHEL");
    expect(r).toMatchObject({ titles: ["MRS"], name: "IBEKWE ETHEL", method: "filename-anchor" });
  });

  it("handles several titles, including unknown ones, when anchored", () => {
    const r = splitTitles("ELDER AMB. HRH MR JOHN DOE", "John Doe");
    expect(r.titles).toEqual(["ELDER", "AMB.", "HRH", "MR"]);
    expect(r.name).toBe("JOHN DOE");
  });

  it("does not eat a first name that looks like a title when anchored", () => {
    const r = splitTitles("MR PRINCE OKORO", "Prince Okoro");
    expect(r.titles).toEqual(["MR"]);
    expect(r.name).toBe("PRINCE OKORO");
  });

  it("tolerates name order differences between filename and badge", () => {
    const r = splitTitles("DR ETHEL IBEKWE", "IBEKWE ETHEL");
    expect(r.titles).toEqual(["DR"]);
    expect(r.name).toBe("ETHEL IBEKWE");
  });

  it("falls back to the title list without a filename", () => {
    const r = splitTitles("PASTOR (MRS) GRACE ADEYEMI", null);
    expect(r.titles).toEqual(["PASTOR", "MRS"]);
    expect(r.name).toBe("GRACE ADEYEMI");
  });

  it("handles phrase titles and post-nominals", () => {
    const r = splitTitles("HIS EXCELLENCY CHIEF EMEKA OBI KSM", null);
    expect(r.titles).toEqual(["HIS", "EXCELLENCY", "CHIEF"]);
    expect(r.name).toBe("EMEKA OBI");
    expect(r.postNominals).toEqual(["KSM"]);
  });

  it("always leaves a name", () => {
    expect(splitTitles("MR", null).name).toBe("MR");
  });
});

describe("parseBadgeLines", () => {
  it("parses the sample FGBMFI badge", () => {
    const r = parseBadgeLines(
      [
        { text: "MRS IBEKWE ETHEL", fontSize: 13, y: 230 },
        { text: "District: South East 1", fontSize: 7, y: 120 },
        { text: "Chapter: Umidim Nnewi", fontSize: 7, y: 110 },
        { text: "ID: CON26111118222902ffc391d2", fontSize: 6, y: 98 },
      ],
      "IBEKWE ETHEL",
    );
    expect(r.split.titles).toEqual(["MRS"]);
    expect(r.split.name).toBe("IBEKWE ETHEL");
    expect(r.district).toBe("South East 1");
    expect(r.chapter).toBe("Umidim Nnewi");
    expect(r.registrationId).toBe("CON26111118222902ffc391d2");
    expect(r.warnings).toEqual([]);
  });

  it("captures unknown labels as extra fields", () => {
    const r = parseBadgeLines(
      [
        { text: "MR JOHN DOE", fontSize: 13, y: 230 },
        { text: "Region: Lagos", fontSize: 7, y: 120 },
        { text: "Delegate Type: Guest", fontSize: 7, y: 110 },
      ],
      null,
    );
    expect(r.extraFields).toEqual({ region: "Lagos", delegateType: "Guest" });
    expect(r.warnings).toContain("No registration ID on the badge");
  });
});

describe("canonical storage form", () => {
  it("normalises names strongly before storing", () => {
    expect(canonicalName("IBEKWE_ETHEL")).toBe("Ibekwe Ethel");
    expect(canonicalName("  ibekwe   ethel_ ")).toBe("Ibekwe Ethel");
    expect(canonicalName("ADE - BELLO o’brien")).toBe("Ade-Bello O'Brien");
    expect(canonicalName("John__Paul  Okafor (2)")).toBe("John Paul Okafor");
    expect(canonicalName("ÉMILE ZOLA")).toBe("Émile Zola");
  });
  it("normalises titles and labels", () => {
    expect(["AMB.", "(MRS)", "Dr"].map(canonicalTitle)).toEqual(["Amb", "Mrs", "Dr"]);
    expect(canonicalLabel("  South_East   1 ")).toBe("South East 1");
    expect(canonicalLabel("   ")).toBeNull();
  });
});

describe("name matching", () => {
  it("normalises accents and punctuation", () => {
    expect(normalizeText("  Adé-Olá  O'Brien ")).toBe("ade ola o brien");
  });
  it("matches regardless of order", () => {
    expect(nameKey("Ibekwe Ethel")).toBe(nameKey("ETHEL IBEKWE"));
    expect(namesMatch("Ibekwe Ethel", "Ethel Ngozi Ibekwe")).toBe(true);
    expect(namesMatch("Ethel", "Ethel Ibekwe")).toBe(false);
    expect(namesMatch("John Doe", "Jane Doe")).toBe(false);
  });
});

describe("paging", () => {
  it("chunks into pages of 4 in order", () => {
    expect(chunkIntoPages([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
  });
  it("checks the multiple-of-4 rule", () => {
    expect(checkCount(0).ok).toBe(false);
    expect(checkCount(16)).toMatchObject({ ok: true, fullPages: 4, remainder: 0 });
    expect(checkCount(18)).toMatchObject({ ok: false, fullPages: 4, remainder: 2, missing: 2 });
    expect(checkCount(3)).toMatchObject({ ok: false, fullPages: 0, remainder: 3, missing: 1 });
  });
});
