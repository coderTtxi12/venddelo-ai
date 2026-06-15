import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function normalizeLocale(locale: string): string {
  const base = locale.split("-")[0].split("_")[0].toLowerCase();
  return ["es", "en", "pt", "fr", "de"].includes(base) ? base : "en";
}

export function draftSubdomain(): string {
  return `draft-${Math.random().toString(36).slice(2, 8)}`;
}
