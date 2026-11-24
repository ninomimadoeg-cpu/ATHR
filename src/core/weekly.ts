// Weeks, weekly report and S-curve — docs/03-calculations.md (prototype vWeekly / curve).
import { dn, ds } from "./dates";
import { agg, plannedFrac, stateAt, type Agg, type Key, type Model } from "./progress";
import type { Entry, ISODate } from "./types";

export const weekOf = (M: Model, d: ISODate) => Math.floor((dn(d) - M.w0) / 7) + 1;
export const weekRange = (M: Model, w: number): [ISODate, ISODate] => [ds(M.w0 + 7 * (w - 1)), ds(M.w0 + 7 * (w - 1) + 6)];
export const lastWeek = (M: Model) => Math.ceil((M.e0 - M.w0 + 1) / 7);

export interface Row { id: string; planned: number; actual: number; gap: number; plannedWeek: number; doneWeek: number }
export interface Delay { key: Key; areas: string[]; valueBehind: number; plannedShare: number; actualShare: number }
export interface WeeklyReport {
  week: number; start: ISODate; end: ISODate; asOf: ISODate; inProgress: boolean;
  actual: number; planned: number; gap: number; doneWeek: number; plannedWeek: number;
  byTrade: Row[]; byArea: Row[]; delays: Delay[];
}

function rows(ids: string[], o1: Record<string, Agg>, o0: Record<string, Agg>, oP: Record<string, Agg>): Row[] {
  const out: Row[] = [];
  for (const id of ids) {
    const a1 = o1[id];
    if (!a1 || !a1.bac) continue;
    const a = a1.ev / a1.bac, p = oP[id].pv / oP[id].bac;
    out.push({ id, planned: p, actual: a, gap: a - p, plannedWeek: (oP[id].pv - (o0[id]?.pv || 0)) / a1.bac, doneWeek: (a1.ev - (o0[id]?.ev || 0)) / a1.bac });
  }
  return out;
}

/** Weekly report for week w as seen on `today` (entries must be sorted). */
export function weeklyReport(M: Model, list: Entry[], w: number, today: ISODate): WeeklyReport {
  const [ws, we] = weekRange(M, w), prev = ds(dn(ws) - 1), end = we > today ? today : we;
  const A1 = agg(M, end, list).all, A0 = agg(M, prev, list).all, P1 = agg(M, we, list).all;
  const tr = (K: Key) => K.it.trade, ar = (K: Key) => K.area;
  const T1 = agg(M, end, list, tr), T0 = agg(M, prev, list, tr), TP = agg(M, we, list, tr);
  const R1 = agg(M, end, list, ar), R0 = agg(M, prev, list, ar), RP = agg(M, we, list, ar);
  const st = stateAt(M, end, list);
  const gaps: Record<string, { key: Key; v: number; pv: number; ev: number; tot: number; areas: Set<string> }> = {};
  for (const K of M.keys) {
    const pf = plannedFrac(K.act, we, M.cal), af = st[K.k] || 0;
    if (pf - af <= 0.001) continue;
    const id = K.it.id + "|" + K.st.id;
    const g = gaps[id] || (gaps[id] = { key: K, v: 0, pv: 0, ev: 0, tot: 0, areas: new Set() });
    g.v += K.v * (pf - af); g.tot += K.v; g.pv += K.v * pf; g.ev += K.v * af; g.areas.add(K.area);
  }
  const delays = Object.values(gaps).sort((a, b) => b.v - a.v).slice(0, 10)
    .map((g) => ({ key: g.key, areas: [...g.areas], valueBehind: g.v, plannedShare: g.tot ? g.pv / g.tot : 0, actualShare: g.tot ? g.ev / g.tot : 0 }));
  const bac = A1.bac || 1;
  return {
    week: w, start: ws, end: we, asOf: end, inProgress: we > today,
    actual: A1.ev / bac, planned: P1.pv / bac, gap: (A1.ev - P1.pv) / bac,
    doneWeek: (A1.ev - A0.ev) / bac, plannedWeek: (P1.pv - A0.pv) / bac,
    byTrade: rows(M.bl.trades.map((t) => t.id), T1, T0, TP),
    byArea: rows(M.bl.areas.map((a) => a.id), R1, R0, RP),
    delays,
  };
}

export interface CurvePoint { w: number; end: ISODate; pv: number; ev: number | null }
/** S-curve: one point per week end; actual up to `upto`. */
export function sCurve(M: Model, list: Entry[], upto: ISODate): CurvePoint[] {
  const pts: CurvePoint[] = [];
  for (let w = 1; w <= lastWeek(M); w++) {
    const end = ds(Math.min(M.w0 + 7 * w - 1, M.e0));
    const a = agg(M, end, list).all;
    let ev: number | null = null;
    if (end <= upto) ev = a.ev / a.bac;
    else if (weekOf(M, upto) === w) ev = agg(M, upto, list).all.ev / a.bac;
    pts.push({ w, end, pv: a.pv / a.bac, ev });
  }
  return pts;
}
