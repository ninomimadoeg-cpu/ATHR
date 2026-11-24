import type { ISODate } from "./types";

/** Day number (days since 1970-01-01, UTC) of an ISO date. */
export const dn = (s: ISODate): number =>
  Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
/** ISO date of a day number. */
export const ds = (n: number): ISODate => new Date(n * 864e5).toISOString().slice(0, 10);
/** Weekday of a day number: 0 = Sunday … 6 = Saturday. */
export const weekday = (n: number): number => (((n + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
export const addDays = (s: ISODate, k: number): ISODate => ds(dn(s) + k);

/**
 * How planned progress advances through time.
 * - calendar: every day counts (the prototype's rule; kept for parity tests)
 * - working:  only days not in offDays count (owner decision: Sat–Thu, Friday off)
 */
export type Calendar = { kind: "calendar" } | { kind: "working"; offDays: number[] };
export const CALENDAR: Calendar = { kind: "calendar" };
export const DEFAULT_OFF_DAYS = [5];
export const workingCalendar = (offDays: number[] = DEFAULT_OFF_DAYS): Calendar => ({ kind: "working", offDays });

/** Number of counted days in [a, b] (day numbers, inclusive). 0 when b < a. */
export function countDays(cal: Calendar, a: number, b: number): number {
  if (b < a) return 0;
  const n = b - a + 1;
  if (cal.kind === "calendar" || cal.offDays.length === 0) return n;
  const off = new Set(cal.offDays);
  const full = Math.floor(n / 7);
  let c = full * (7 - off.size);
  for (let d = a + full * 7; d <= b; d++) if (!off.has(weekday(d))) c++;
  return c;
}
