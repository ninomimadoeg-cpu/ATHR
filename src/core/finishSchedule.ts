// Room finish schedule import — docs/04-finish-schedule.md. Port of tools/finish_schedule.py `import`
// (via the prototype's fsRead/fsMetrics/fsTake/fsApply). Must give identical splits to the Python tool.
import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import { keyOf } from "./progress";
import type { Area, Baseline, Entry } from "./types";

export const FS_KEYS = ["id", "en", "ar", "type", "len", "wid", "area_ov", "per_ov", "h", "open", "doors", "floor", "skirt", "wall1", "wall1h", "wall2", "ceil", "cpaint", "sc7", "sc25", "wp", "showers", "notes"] as const;
export const FS_BASES = ["floor", "skirting", "wall", "ceiling", "ceiling-paint", "screed7", "screed25", "wp-floor", "wp-upturn", "wp-shower"] as const;

type Cell = string | number | boolean | null | undefined;
export type Room = Record<(typeof FS_KEYS)[number], Cell> & { id: string; floor: string; skirt: string; wall1: string; wall2: string; ceil: string; wp: string; cpaint: string; sc7: string; sc25: string; type: string; en: string; ar: string };
export interface FinishCode { code: string; basis: string; desc: string; loc: string; boq: string | null }
export interface FsParams { upturn: number; shower: number }
export interface ParsedSchedule { rooms: Room[]; codes: FinishCode[]; params: FsParams; other: Record<string, Record<string, number>> }

const fnum = (v: Cell): number | null => (v === null || v === undefined || v === "" || isNaN(+(v as number)) ? null : +(v as number));
const fstr = (v: Cell): string => (v === null || v === undefined ? "" : String(v).trim());

export function readSchedule(wb: WorkBook): ParsedSchedule {
  for (const n of ["Rooms", "Finish codes", "Other items"]) if (!wb.Sheets[n]) throw new Error(`Sheet "${n}" is missing — use the template from this app`);
  const rows = (n: string) => XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
  const R = rows("Rooms"), rooms: Room[] = [];
  for (let i = 5; i < R.length; i++) {
    const row = R[i] || [];
    const r = {} as Room;
    FS_KEYS.forEach((k, j) => ((r as Record<string, Cell>)[k] = row[j]));
    r.id = fstr(r.id);
    if (!r.id || /^(totals|example)$/i.test(r.id)) continue;
    for (const k of ["floor", "skirt", "wall1", "wall2", "ceil", "wp", "cpaint", "sc7", "sc25", "type", "en", "ar"] as const) (r as Record<string, Cell>)[k] = fstr(r[k]);
    rooms.push(r);
  }
  const fc = wb.Sheets["Finish codes"], F = rows("Finish codes");
  const params = { upturn: fnum(fc.C3?.v as Cell) ?? 0.3, shower: fnum(fc.C4?.v as Cell) ?? 0 };
  const codes: FinishCode[] = [];
  for (let i = 7; i < F.length; i++) {
    const [code, basis, desc, loc, boq] = F[i] || [];
    if (fstr(code) && fstr(basis)) codes.push({ code: fstr(code), basis: fstr(basis), desc: fstr(desc), loc: fstr(loc), boq: fstr(boq) || null });
  }
  const O = rows("Other items"), hdr = (O[3] || []).map(fstr), ti = hdr.indexOf("Total");
  if (ti < 0) throw new Error('"Other items" sheet has no Total column');
  const acols: [number, string][] = [];
  for (let j = 5; j < ti; j++) if (hdr[j]) acols.push([j, hdr[j]]);
  const other: Record<string, Record<string, number>> = {};
  for (let i = 4; i < O.length; i++) {
    const row = O[i] || [];
    const id = fstr(row[0]);
    if (!id) continue;
    const al: Record<string, number> = {};
    for (const [j, a] of acols) { const v = fnum(row[j]); if (v) al[a] = v }
    other[id] = al;
  }
  return { rooms, codes, params, other };
}

export interface RoomMetrics { area: number; per: number; skirt: number; w1: number; w2: number; ceil: number; up: number; sh: number }
export function roomMetrics(r: Room, p: FsParams): RoomMetrics {
  const ln = fnum(r.len), wd = fnum(r.wid), aov = fnum(r.area_ov), pov = fnum(r.per_ov), h = fnum(r.h) || 0;
  const area = aov !== null ? aov : (ln || 0) * (wd || 0), per = pov !== null ? pov : 2 * ((ln || 0) + (wd || 0));
  const opn = fnum(r.open) || 0, doors = fnum(r.doors) || 0, w1h = fnum(r.wall1h), h1 = w1h === null ? h : Math.min(w1h, h);
  return {
    area, per, skirt: r.skirt ? Math.max(0, per - doors) : 0, w1: r.wall1 ? Math.max(0, per * h1 - opn) : 0, w2: r.wall2 ? per * Math.max(0, h - h1) : 0,
    ceil: r.ceil ? area : 0, up: r.wp.toUpperCase() === "WPF" ? per * p.upturn : 0, sh: (fnum(r.showers) || 0) * p.shower,
  };
}
export function takeoff(r: Room, m: RoomMetrics, code: string, basis: string): number {
  const g = (k: keyof Room) => String(r[k] || "").toUpperCase(), c = code.toUpperCase();
  switch (basis) {
    case "floor": return g("floor") === c ? m.area : 0;
    case "skirting": return g("skirt") === c ? m.skirt : 0;
    case "wall": return (g("wall1") === c ? m.w1 : 0) + (g("wall2") === c ? m.w2 : 0);
    case "ceiling": return g("ceil") === c ? m.ceil : 0;
    case "ceiling-paint": return g("cpaint") === "Y" ? m.ceil : 0;
    case "screed7": return g("sc7") === "Y" ? m.area : 0;
    case "screed25": return g("sc25") === "Y" ? m.area : 0;
    case "wp-floor": return g("wp") === c ? m.area : 0;
    case "wp-upturn": return m.up;
    case "wp-shower": return m.sh;
  }
  return 0;
}

export interface FinishLineReport { id: string; en: string; unit: string; boq: number; take: number; diff: number; n: number }
export interface ImportReport { errors: string[]; warnings: string[]; finish: FinishLineReport[]; other: number }

const fmt = (x: number) => (Math.round(x * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Apply a parsed schedule to a baseline (never mutates the input). Show the report as a preview; save only on confirm. */
export function applySchedule(baseline: Baseline, P: ParsedSchedule, entries: Entry[] = []): { baseline: Baseline; report: ImportReport } {
  const b: Baseline = structuredClone(baseline);
  const items: Record<string, Baseline["items"][number]> = {};
  b.items.forEach((i) => (items[i.id] = i));
  const rep: ImportReport = { errors: [], warnings: [], finish: [], other: 0 };
  const ids = P.rooms.map((r) => r.id);
  const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  if (dup.length) rep.errors.push("Duplicate Area IDs: " + dup.join(", "));
  for (const id of ids) if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) rep.errors.push(`Area ID "${id}" — use letters, digits, - or _ only`);
  const known = new Set(P.codes.map((c) => c.code.toUpperCase()));
  for (const r of P.rooms)
    for (const [k, l] of [["floor", "Floor"], ["skirt", "Skirting"], ["wall1", "Wall 1"], ["wall2", "Wall 2"], ["ceil", "Ceiling"]] as const) {
      const v = String(r[k] || "").toUpperCase();
      if (v && v !== "-" && v !== "–" && !known.has(v)) rep.warnings.push(`${r.id}: ${l} code "${v}" is not in Finish codes — ignored`);
    }
  const M2: Record<string, RoomMetrics> = {};
  P.rooms.forEach((r) => (M2[r.id] = roomMetrics(r, P.params)));
  const by: Record<string, Record<string, number>> = {};
  for (const cd of P.codes) {
    if (!cd.boq) continue;
    if (!items[cd.boq]) { rep.warnings.push(`Code ${cd.code}: BOQ line "${cd.boq}" not found`); continue }
    if (!(FS_BASES as readonly string[]).includes(cd.basis)) { rep.errors.push(`Code ${cd.code}: unknown basis "${cd.basis}"`); continue }
    const t = by[cd.boq] || (by[cd.boq] = {});
    for (const r of P.rooms) { const v = takeoff(r, M2[r.id], cd.code, cd.basis); if (v > 0) t[r.id] = (t[r.id] || 0) + v }
  }
  for (const [iid, t] of Object.entries(by)) {
    const it = items[iid], tot = Object.values(t).reduce((a, x) => a + x, 0);
    if (tot <= 0) { rep.warnings.push(`${iid} ${it.en}: no area uses its finish code — split left unchanged`); continue }
    const al: Record<string, number> = {};
    for (const [a, v] of Object.entries(t)) al[a] = Math.round(((it.qty * v) / tot) * 100) / 100;
    const k = Object.keys(al).reduce((x, y) => (al[x] >= al[y] ? x : y));
    al[k] = Math.round((al[k] + it.qty - Object.values(al).reduce((a, x) => a + x, 0)) * 100) / 100;
    rep.finish.push({ id: iid, en: it.en, unit: it.unit, boq: it.qty, take: tot, diff: it.qty ? (tot - it.qty) / it.qty : 0, n: Object.keys(al).length });
    it.alloc = al;
  }
  for (const [iid, al] of Object.entries(P.other)) {
    if (by[iid]) continue;
    if (!items[iid]) { rep.warnings.push(`Other items: "${iid}" not in BOQ — ignored`); continue }
    const it = items[iid], tot = Object.values(al).reduce((a, x) => a + x, 0);
    if (!Object.keys(al).length) { rep.warnings.push(`${iid} ${it.en}: no areas given — split left unchanged`); continue }
    if (Math.abs(tot - it.qty) > 0.01) rep.warnings.push(`${iid} ${it.en}: areas add up to ${fmt(tot)} but BOQ is ${fmt(it.qty)}`);
    it.alloc = al;
    rep.other++;
  }
  const old: Record<string, Area> = {};
  b.areas.forEach((a) => (old[a.id] = a));
  const kind: Record<string, string> = { room: "dry", wet: "wet", terrace: "ter" };
  const areas: Area[] = P.rooms.map((r) => ({ id: r.id, en: r.en || r.id, ar: r.ar || r.en || r.id, kind: kind[r.type.toLowerCase()] || old[r.id]?.kind || "dry" }));
  const used = new Set(b.items.flatMap((i) => Object.keys(i.alloc || {})));
  for (const a of ["GEN", ...Object.keys(old)])
    if ((used.has(a) || a === "GEN") && !areas.some((x) => x.id === a)) areas.push(old[a] || { id: a, en: a, ar: a, kind: "gen" });
  const miss = [...used].filter((a) => !areas.some((x) => x.id === a));
  if (miss.length) rep.errors.push("Area IDs used in Other items but not in Rooms: " + miss.join(", "));
  b.areas = areas;
  b.finishSchedule = { rooms: P.rooms.map((r) => ({ ...r })), codes: P.codes, params: P.params };
  b.rev = (+(b.rev ?? 1) || 1) + 1;
  const keys = new Set<string>();
  b.items.forEach((i) => Object.keys(i.alloc || {}).forEach((a) => i.stages.forEach((s) => keys.add(keyOf(i.id, a, s.id)))));
  const orphan = entries.filter((e) => e.item && !keys.has(keyOf(e.item, e.area, e.stage))).length;
  if (orphan) rep.warnings.push(`${orphan} existing site entries are for an item/area combination that no longer exists — they will stop counting`);
  return { baseline: b, report: rep };
}
