import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeNumericString(value: string): string {
  if (value.includes(",")) return value.replace(/[\s.]/g, "").replace(",", ".");
  if (/^-?(?:\d{1,3}\.)+\d{3}$/.test(value)) return value.replace(/[\s.]/g, "");
  return value.replace(/\s/g, "");
}

const nokFormatter = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
});

const nokFormatterDecimals = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 0,
});

const moneyInputFormatter = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = typeof value === "number" ? value : normalizeNumericString(value);
  const n = typeof normalized === "number" ? normalized : Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(value: number): number {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

export function formatMoneyInput(value: string | number | null | undefined): string {
  return moneyInputFormatter.format(toNumber(value));
}

export function formatNOK(value: string | number | null | undefined, decimals = false): string {
  const n = toNumber(value);
  return decimals ? nokFormatterDecimals.format(n) : nokFormatter.format(n);
}

export function formatNumber(value: string | number | null | undefined): string {
  return numberFormatter.format(toNumber(value));
}

export function formatPercent(value: string | number | null | undefined, decimals = 1): string {
  const n = toNumber(value);
  return `${n.toFixed(decimals).replace(".", ",")} %`;
}

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Mars",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function monthLabel(yearMonth: string): string {
  const parts = yearMonth.split("-");
  const year = parts[0] ?? "";
  const monthStr = parts[1] ?? "01";
  const m = parseInt(monthStr, 10) - 1;
  const name = MONTH_NAMES[m] ?? "";
  return `${name} ${year}`;
}

export function shortMonthLabel(yearMonth: string): string {
  const parts = yearMonth.split("-");
  const monthStr = parts[1] ?? "01";
  const m = parseInt(monthStr, 10) - 1;
  return MONTH_NAMES[m]?.slice(0, 3) ?? "";
}

export function currentYearMonth(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function previousYearMonth(yearMonth: string): string {
  const parts = yearMonth.split("-");
  const y = parseInt(parts[0] ?? "1970", 10);
  const m = parseInt(parts[1] ?? "1", 10);
  const d = new Date(y, m - 2, 1);
  return currentYearMonth(d);
}

export function nextYearMonth(yearMonth: string): string {
  const parts = yearMonth.split("-");
  const y = parseInt(parts[0] ?? "1970", 10);
  const m = parseInt(parts[1] ?? "1", 10);
  const d = new Date(y, m, 1);
  return currentYearMonth(d);
}

export function monthsInYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatISODate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("nb-NO", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}

export function dayAfter(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function dayBefore(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
