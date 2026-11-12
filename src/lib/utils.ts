import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "IBEKWE ETHEL" -> "Ibekwe Ethel". Keeps hyphenated and apostrophe names intact. */
export function toDisplayCase(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-zÀ-ɏ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}
