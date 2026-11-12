import type { AnalyzedFile, DuplicateMatch } from "@/lib/types";

export const ACCEPTED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};
export const MAX_FILE_MB = 10;
/** Protects the browser on very large drops. Not a business rule. */
export const MAX_FILES_PER_UPLOAD = 400;
export const ANALYZE_CONCURRENCY = 10;

export type IntakeFile = {
  key: string;
  name: string;
  size: number;
  status: "pending" | "reading" | "ready" | "failed";
  error?: string;
  analysis?: AnalyzedFile;
};

export type FlagSource =
  | { kind: "system"; match: DuplicateMatch }
  | { kind: "upload"; otherKey: string; label: string; strength: 1 | 2 | 3 };

export type FlaggedFile = { file: IntakeFile; flags: FlagSource[] };

export type Decision = "keep" | "exclude" | "replace";
