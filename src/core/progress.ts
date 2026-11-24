// Progress maths — docs/03-calculations.md. Ported from prototype/index.html
// (buildModel, plannedFrac, stateAt, agg). Results must stay identical on the calendar-day rule.
import { CALENDAR, countDays, dn, workingCalendar, type Calendar } from "./dates";
import type { Activity, Area, Baseline, Entry, ISODate, Item, Stage, Trade } from "./types";

export interface Key {
  k: string; // item|area|stage
  it: Item;
  area: string;
  st: Stage;
  q: number; // quantity of the item in this area
  v: number; // value = q × rate × w/100
  tw: number; // target weight share (targets only; 0 for BOQ items)
  act: Activity | undefined;
}

export interface Model {
  bl: Baseline;
  items: Record<string, Item>;
  areas: Record<string, Area>;
  acts: Record<string, Activity>;
  trades: Record<string, Trade>;
  keys: Key[];
  kmap: Record<string, Key>;
  bac: number;
  s0: number; // project start (day number)
  e0: number; // project end
  w0: number; // first day of week 1
  cal: Calendar;
}

export const keyOf = (item: string, area: string, stage: string) => `${item}|${area}|${stage}`;
export const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** The project's planning calendar: working days (off days default Friday). */
export const projectCalendar = (bl: Baseline): Calendar => workingCalendar(bl.offDays ?? [5]);

export function buildModel(bl: Baseline, cal: Calendar = projectCalendar(bl)): Model {
  const items: Record<string, Item> = {}, areas: Record<string, Area> = {}, acts: Record<string, Activity> = {}, trades: Record<string, Trade> = {};
  bl.items.forEach((i) => (items[i.id] = i));
  bl.areas.forEach((a) => (areas[a.id] = a));
  bl.acts.forEach((a) => (acts[a.id] = a));
  bl.trades.forEach((t) => (trades[t.id] = t));
  const keys: Key[] = [];
  let bac = 0;
  for (const it of bl.items)
    for (const [area, q] of Object.entries(it.alloc || {}))
      for (const st of it.stages) {
        const v = (q * it.rate * st.w) / 100;
        bac += v;
        keys.push({ k: keyOf(it.id, area, st.id), it, area, st, q, v, tw: it.tgt ? ((it.tgt.w || 1) * st.w) / 100 : 0, act: acts[st.act] });
      }
  const kmap: Record<string, Key> = {};
  keys.forEach((k) => (kmap[k.k] = k));
  const s0 = dn(bl.start);
  const w0 = s0 - ((new Date(s0 * 864e5).getUTCDay() - (bl.weekStart || 0) + 7) % 7);
  return { bl, items, areas, acts, trades, keys, kmap, bac, s0, e0: dn(bl.end), w0, cal };
}

export { CALENDAR };

/**
 * Planned fraction of an activity at date d: 0 before it starts, 1 from its last day, otherwise the share of
 * counted days elapsed (inclusive). On the working calendar an activity made only of off days falls back to calendar days.
 */
export function plannedFrac(act: Activity | undefined, d: ISODate, cal: Calendar = CALENDAR): number {
  if (!act) return 0;
  const s = dn(act.s), e = dn(act.e), x = dn(d);
  if (x < s) return 0;
  if (x >= e) return 1;
  const total = countDays(cal, s, e);
  if (total === 0) return (x - s + 1) / (e - s + 1);
  return countDays(cal, s, x) / total;
}

/** Entries in the order progress is replayed: by work date, then creation time. */
export function sortEntries(list: Entry[]): Entry[] {
  return list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || "") < (b.at || "") ? -1 : 1));
}

/** Done fraction of every key at date d. `list` must be sorted (sortEntries). */
export function stateAt(M: Model, d: ISODate, list: Entry[]): Record<string, number> {
  const st: Record<string, number> = {};
  for (const e of list) {
    if (e.date > d) break;
    const k = keyOf(e.item, e.area, e.stage), K = M.kmap[k];
    if (!K) continue;
    if (e.kind === "add") st[k] = clamp((st[k] || 0) + (+e.val || 0) / K.q);
    else if (e.kind === "set") st[k] = clamp(+e.val || 0);
  }
  return st;
}

export interface Agg { bac: number; pv: number; ev: number }

/** Earned (ev), planned (pv) and budget (bac) value per group at date d. */
export function agg(M: Model, d: ISODate, list: Entry[], group?: (K: Key) => string): Record<string, Agg> {
  const st = stateAt(M, d, list), out: Record<string, Agg> = {};
  for (const K of M.keys) {
    const g = group ? group(K) : "all";
    const o = out[g] || (out[g] = { bac: 0, pv: 0, ev: 0 });
    o.bac += K.v;
    o.pv += K.v * plannedFrac(K.act, d, M.cal);
    o.ev += K.v * (st[K.k] || 0);
  }
  return out;
}

/** Progress of one area for the site tiles: value-weighted, or target-weighted when the project has no BOQ value. */
export function areaStats(M: Model, area: string, list: Entry[], d: ISODate) {
  const st = stateAt(M, d, list);
  const W = (K: Key) => (M.bac > 0 ? K.v : K.tw);
  let v = 0, e = 0, p = 0, n = 0;
  for (const K of M.keys)
    if (K.area === area) {
      n++;
      v += W(K);
      e += W(K) * (st[K.k] || 0);
      p += W(K) * plannedFrac(K.act, d, M.cal);
    }
  return { a: v ? e / v : 0, p: v ? p / v : 0, n };
}
