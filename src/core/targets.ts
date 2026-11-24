// Targets and KPIs for weeks / months — docs/07 (prototype kpiModel, newTarget).
import { countDays, dn, ds, weekday, workingCalendar } from "./dates";
import { agg, plannedFrac, stateAt, type Model } from "./progress";
import { weekOf, weekRange } from "./weekly";
import type { Activity, Entry, ISODate, Item, Mode } from "./types";

export type Period = { kind: "w"; n: number } | { kind: "m"; n: string }; // n: week number | "2026-12"

export function periodRange(M: Model, P: Period): [ISODate, ISODate] {
  if (P.kind === "w") return weekRange(M, P.n);
  const y = +P.n.slice(0, 4), mo = +P.n.slice(5, 7);
  return [ds(Date.UTC(y, mo - 1, 1) / 864e5), ds(Date.UTC(y, mo, 1) / 864e5 - 1)];
}
export function periodStep(P: Period, k: number): Period {
  if (P.kind === "w") return { kind: "w", n: P.n + k };
  const d = new Date(Date.UTC(+P.n.slice(0, 4), +P.n.slice(5, 7) - 1 + k, 1));
  return { kind: "m", n: d.toISOString().slice(0, 7) };
}
export const periodOf = (M: Model, kind: "w" | "m", today: ISODate): Period =>
  kind === "w" ? { kind: "w", n: Math.max(1, weekOf(M, today)) } : { kind: "m", n: today.slice(0, 7) };
export const periodId = (P: Period) => P.kind + P.n;

export interface NewTarget {
  en: string; ar?: string; trade: string; area: string; w?: number; mode: Mode; qty: number; unit: string;
  from?: string; co?: string; proposal?: string;
}
/** A target is an item with no money (rate 0), one stage "all" and its own activity spanning the period. */
export function makeTarget(M: Model, t: NewTarget, P: Period, id: string, by = "", at = ""): { item: Item; act: Activity } {
  const [ps, pe] = periodRange(M, P);
  const item: Item = {
    id, code: "T", trade: t.trade, en: t.en, ar: t.ar || t.en, unit: t.unit || "", qty: t.qty, rate: 0, mode: t.mode,
    stages: [{ id: "all", en: "All", ar: "الكل", w: 100, act: "tg-" + id }], alloc: { [t.area]: t.qty },
    tgt: { per: periodId(P), w: t.w || 1, at, by, ...(t.from ? { from: t.from } : {}), ...(t.co ? { co: t.co } : {}), ...(t.proposal ? { proposal: t.proposal } : {}) },
  };
  return { item, act: { id: "tg-" + id, en: t.en, ar: t.ar || t.en, s: ps, e: pe, trade: t.trade, tg: true } };
}

export interface TargetRow { it: Item; area: string; q: number; f: number; w: number; a: Activity; pf: number }
export interface EngineerRow { by: string; entries: number; days: number; photos: number; last: ISODate }
export interface Kpis {
  start: ISODate; end: ISODate; asOf: ISODate; started: boolean;
  targets: TargetRow[]; open: TargetRow[];
  score: number | null; planned: number | null; done: number;
  workDays: number; reportDays: number; photos: number; entries: number; areas: number; last: ISODate | null;
  engineers: EngineerRow[];
  boq: { actual: number; planned: number; doneInPeriod: number; plannedInPeriod: number } | null;
}

const photoCount = (e: Entry) => (e.photos || []).length;

/** KPIs for one period as of min(today, period end). `list` sorted. */
export function kpis(M: Model, list: Entry[], P: Period, today: ISODate): Kpis {
  const [ps, pe] = periodRange(M, P), asOf = today < pe ? today : pe, started = today >= ps;
  const st = stateAt(M, asOf, list);
  const targets: TargetRow[] = [], open: TargetRow[] = [];
  for (const it of M.bl.items) {
    if (!it.tgt) continue;
    const a = M.acts[it.stages[0].act];
    if (!a) continue;
    for (const [area, q] of Object.entries(it.alloc || {})) {
      const f = st[`${it.id}|${area}|all`] || 0;
      const row = { it, area, q, f, w: it.tgt.w || 1, a, pf: plannedFrac(a, asOf, M.cal) };
      if (a.e >= ps && a.e <= pe) targets.push(row); // a target belongs to the period it is due in
      else if (a.e < ps && f < 1 - 1e-6) open.push(row);
    }
  }
  const W = targets.reduce((s, r) => s + r.w, 0);
  const score = W ? targets.reduce((s, r) => s + r.w * r.f, 0) / W : null;
  const planned = W ? targets.reduce((s, r) => s + r.w * (started ? r.pf : 0), 0) / W : null;
  const inP = list.filter((e) => e.date >= ps && e.date <= asOf);
  const off = new Set(M.bl.offDays ?? [5]);
  const from = Math.max(dn(ps), dn(M.bl.start));
  const workDays = started ? countDays(workingCalendar([...off]), from, dn(asOf)) : 0;
  const days = new Set(inP.map((e) => e.date));
  const eng: Record<string, { by: string; entries: number; days: Set<string>; photos: number; last: ISODate }> = {};
  for (const e of inP) {
    const o = eng[e.by] || (eng[e.by] = { by: e.by, entries: 0, days: new Set(), photos: 0, last: "" });
    if (e.kind === "add" || e.kind === "set") o.entries++;
    o.days.add(e.date); o.photos += photoCount(e);
    if (e.date > o.last) o.last = e.date;
  }
  let boq: Kpis["boq"] = null;
  if (M.bac > 0 && started) {
    const prev = ds(dn(ps) - 1), A1 = agg(M, asOf, list).all, A0 = agg(M, prev, list).all;
    boq = { actual: A1.ev / A1.bac, planned: A1.pv / A1.bac, doneInPeriod: (A1.ev - A0.ev) / A1.bac, plannedInPeriod: (A1.pv - A0.pv) / A1.bac };
  }
  const workingDay = (d: ISODate) => !off.has(weekday(dn(d))) && d >= M.bl.start;
  return {
    start: ps, end: pe, asOf, started, targets, open, score, planned,
    done: targets.filter((r) => r.f >= 1 - 1e-6).length,
    workDays, reportDays: [...days].filter(workingDay).length,
    photos: inP.reduce((s, e) => s + photoCount(e), 0),
    entries: inP.filter((e) => e.kind === "add" || e.kind === "set").length,
    areas: new Set(inP.map((e) => e.area)).size,
    last: list.filter((e) => e.date <= asOf).at(-1)?.date ?? null,
    engineers: Object.values(eng).map((o) => ({ by: o.by, entries: o.entries, days: [...o.days].filter(workingDay).length, photos: o.photos, last: o.last })),
    boq,
  };
}
