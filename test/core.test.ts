import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyChangeOrder, linesValue, valueMismatch } from "../src/core/changeOrders";
import { CALENDAR, countDays, dn, workingCalendar } from "../src/core/dates";
import { applySchedule, readSchedule } from "../src/core/finishSchedule";
import { agg, buildModel, plannedFrac, sortEntries, type Model } from "../src/core/progress";
import { kpis, makeTarget, periodRange } from "../src/core/targets";
import { todo } from "../src/core/todo";
import { weeklyReport, lastWeek } from "../src/core/weekly";
import type { Baseline, Entry } from "../src/core/types";

const BL: Baseline = JSON.parse(readFileSync("prototype/baseline-wg5.json", "utf8"));
const ENTRIES: Entry[] = sortEntries(JSON.parse(readFileSync("prototype/sample-wg5.json", "utf8")));
const TODAY = "2026-11-24";
const p1 = (x: number) => +(x * 100).toFixed(1);

describe("prototype parity — calendar days (docs/03 reference numbers)", () => {
  const M = buildModel(BL, CALENDAR);
  it("BAC", () => expect(Math.round(M.bac)).toBe(2325121));
  it("overview as of 24 Nov: 10.9% actual / 16.2% planned / SPI 0.68", () => {
    const a = agg(M, TODAY, ENTRIES).all;
    expect(p1(a.ev / a.bac)).toBe(10.9);
    expect(p1(a.pv / a.bac)).toBe(16.2);
    expect(+(a.ev / a.pv).toFixed(2)).toBe(0.68);
  });
  it("17 weeks", () => expect(lastWeek(M)).toBe(17));
  it("week 4 report", () => {
    const r = weeklyReport(M, ENTRIES, 4, TODAY);
    expect([r.start, r.end]).toEqual(["2026-11-22", "2026-11-28"]);
    expect([p1(r.actual), p1(r.planned)]).toEqual([10.9, 18.5]);
    expect([p1(r.doneWeek), p1(r.plannedWeek)]).toEqual([2.8, 4.2]);
    const t = Object.fromEntries(r.byTrade.map((x) => [x.id, [p1(x.actual), p1(x.planned)]]));
    expect(t).toEqual({ F: [0, 0], H: [19.4, 33.1], E: [18.2, 28.3], P: [23, 47.4] });
  });
  it("81 sample entries awaiting approval", () => expect(ENTRIES.filter((e) => e.status === "entered").length).toBe(81));
});

describe("working-day calendar (owner decision: Friday off)", () => {
  const cal = workingCalendar([5]);
  it("counts Sat–Thu only", () => {
    // Sun 22 Nov → Sat 28 Nov 2026 contains one Friday (27th)
    expect(countDays(cal, dn("2026-11-22"), dn("2026-11-28"))).toBe(6);
    expect(countDays(cal, dn("2026-11-01"), dn("2026-11-30"))).toBe(26);
    expect(countDays(CALENDAR, dn("2026-11-01"), dn("2026-11-30"))).toBe(30);
  });
  it("planned fraction does not move on a Friday", () => {
    const act = { id: "x", en: "", ar: "", trade: "E", s: "2026-11-22", e: "2026-11-28" };
    expect(plannedFrac(act, "2026-11-26", cal)).toBeCloseTo(5 / 6);
    expect(plannedFrac(act, "2026-11-27", cal)).toBeCloseTo(5 / 6);
    expect(plannedFrac(act, "2026-11-28", cal)).toBe(1);
  });
  it("an activity made only of off days falls back to calendar days", () => {
    const fri = { id: "f", en: "", ar: "", trade: "E", s: "2026-11-27", e: "2026-11-27" };
    expect(plannedFrac(fri, "2026-11-27", cal)).toBe(1);
  });
  it("actual progress is unchanged; WG5 reference numbers on working days", () => {
    const M = buildModel(BL); // project default: working days, Friday off
    const a = agg(M, TODAY, ENTRIES).all;
    expect(p1(a.ev / a.bac)).toBe(10.9);
    expect(workingRef(M)).toEqual(WORKING_REF);
  });
});

// Working-day reference numbers for WG5 (to be confirmed by the owner, then copied into docs/03).
const WORKING_REF = {
  overview: { actual: 10.9, planned: 16.5, spi: 0.66 },
  week4: { actual: 10.9, planned: 18.5, done: 2.8, plannedWeek: 4.2 },
};
function workingRef(M: Model) {
  const a = agg(M, TODAY, ENTRIES).all, r = weeklyReport(M, ENTRIES, 4, TODAY);
  return {
    overview: { actual: p1(a.ev / a.bac), planned: p1(a.pv / a.bac), spi: +(a.ev / a.pv).toFixed(2) },
    week4: { actual: p1(r.actual), planned: p1(r.planned), done: p1(r.doneWeek), plannedWeek: p1(r.plannedWeek) },
  };
}

describe("finish schedule import — identical to tools/finish_schedule.py", () => {
  const ref = JSON.parse(readFileSync("test/fixtures/wg5-finish-schedule-python.json", "utf8"));
  const wb = XLSX.read(readFileSync("data/WG5 Finish Schedule.xlsx"));
  const P = readSchedule(wb);
  const { baseline, report } = applySchedule(BL, P, ENTRIES);
  it("no errors or warnings", () => { expect(report.errors).toEqual([]); expect(report.warnings).toEqual([]) });
  it("same areas in the same order", () => expect(baseline.areas.map((a) => a.id)).toEqual(ref.areas));
  it("same split for every BOQ line", () => {
    for (const it of baseline.items) expect([it.id, it.alloc]).toEqual([it.id, ref.alloc[it.id]]);
  });
  it("16 finish lines re-split, totals equal the BOQ", () => {
    expect(report.finish.length).toBe(16);
    for (const f of report.finish) {
      const it = baseline.items.find((i) => i.id === f.id)!;
      expect(Object.values(it.alloc).reduce((a, b) => a + b, 0)).toBeCloseTo(it.qty, 2);
    }
  });
  it("does not change the input baseline", () => expect(BL.rev).toBe(JSON.parse(readFileSync("prototype/baseline-wg5.json", "utf8")).rev));
});

describe("to-do note", () => {
  const M = buildModel(BL, CALENDAR);
  const T = todo(M, ENTRIES, 4, TODAY);
  it("groups overdue / due / starting this week", () => {
    expect(new Set(T.groups.map((g) => g.kind))).toEqual(new Set(["overdue", "week", "starts"]));
    const conduits = T.groups.find((g) => g.act.id === "conduit")!;
    expect(conduits.kind).toBe("overdue");
  });
  it("counted items are asked in half units", () => {
    for (const g of T.groups) for (const L of g.lines) if (L.it.unit === "no." && L.it.mode === "qty")
      for (const a of L.areas) expect(Math.round(a.nq * 2 + a.f * a.q * 2) % 1).toBe(0);
  });
});

describe("targets and KPIs (project with no BOQ)", () => {
  const blank: Baseline = {
    id: "villa", en: "Villa 12", ar: "فيلا ١٢", currency: "EGP", start: "2026-11-24", end: "2027-03-31", weekStart: 0,
    areas: [{ id: "A01", en: "Ground floor", ar: "الأرضي" }, { id: "GEN", en: "Whole site", ar: "الموقع" }],
    trades: [{ id: "G", en: "General", ar: "عام" }], acts: [], items: [],
  };
  const M0 = buildModel(blank);
  const P = { kind: "w", n: 1 } as const;
  const add = (t: Parameters<typeof makeTarget>[1], id: string) => { const { item, act } = makeTarget(M0, t, P, id); blank.items.push(item); blank.acts.push(act) };
  add({ en: "Conduits", trade: "G", area: "A01", w: 3, mode: "check", qty: 1, unit: "" }, "T1");
  add({ en: "Plaster", trade: "G", area: "A01", w: 2, mode: "qty", qty: 120, unit: "m²" }, "T2");
  add({ en: "Roof WP", trade: "G", area: "GEN", w: 1, mode: "pct", qty: 1, unit: "%" }, "T3");
  const M = buildModel(blank);
  const e = (id: string, item: string, area: string, kind: Entry["kind"], val: number, photos: string[] = []): Entry =>
    ({ id, project: "villa", item, area, stage: item ? "all" : "", date: "2026-11-24", kind, val, by: "eng1", at: "2026-11-24T10:00:" + id, status: "entered", photos });
  const list = sortEntries([e("01", "T1", "A01", "set", 1, ["p1"]), e("02", "T2", "A01", "add", 45), e("03", "", "GEN", "note", 0)]);
  it("targets never add money", () => expect(M.bac).toBe(0));
  it("week 1 runs Sun 22 – Sat 28 Nov", () => expect(periodRange(M, P)).toEqual(["2026-11-22", "2026-11-28"]));
  it("weighted score, completion and reporting", () => {
    const K = kpis(M, list, P, "2026-11-24");
    expect(K.targets.length).toBe(3);
    expect(K.score).toBeCloseTo((3 * 1 + 2 * (45 / 120) + 0) / 6);
    expect(K.done).toBe(1);
    expect(K.workDays).toBe(1); // project started 24 Nov
    expect(K.reportDays).toBe(1);
    expect(K.photos).toBe(1);
    expect(K.entries).toBe(2); // notes don't count as progress entries
    expect(K.engineers[0]).toMatchObject({ by: "eng1", entries: 2, days: 1, photos: 1 });
    expect(K.boq).toBeNull();
  });
  it("a month view includes the targets due that month", () => {
    const K = kpis(M, list, { kind: "m", n: "2026-11" }, "2026-11-24");
    expect(K.targets.length).toBe(3);
  });
  it("unfinished targets show as still open in the next period", () => {
    const K = kpis(M, list, { kind: "w", n: 2 }, "2026-11-30");
    expect(K.open.map((r) => r.it.id).sort()).toEqual(["T2", "T3"]);
  });
});

describe("change orders", () => {
  const b: Baseline = structuredClone(BL);
  const M = buildModel(b, CALENDAR);
  const lines = [
    { type: "add" as const, en: "Gypsum ceiling – master", trade: "F", qty: 22, unit: "m²", rate: 1750, area: "MAST" },
    { type: "qty" as const, item: "F4.1", qty: 500 },
  ];
  const lv = linesValue(b, lines)!;
  b.cos = [{ id: "CO-01", date: TODAY, title: "Client adds ceiling", kind: "Addition", value: 38500, days: 7, lines, linesValue: lv, status: "pending" }];
  it("lines value = new line + quantity change × existing rate", () => expect(lv).toBeCloseTo(22 * 1750 + (500 - 466.17) * 220, 2));
  it("warns when the typed value differs by more than 1%", () => {
    expect(valueMismatch(b.cos![0])).toBe(true);
    expect(valueMismatch({ value: lv * 1.005, linesValue: lv })).toBe(false);
    expect(valueMismatch({ value: 5000, linesValue: null })).toBe(false);
  });
  const { baseline: nb, warnings } = applyChangeOrder(b, "CO-01", TODAY, M.bac);
  it("applies lines, extends the end date and keeps history", () => {
    expect(warnings).toEqual([]);
    expect(nb.rev).toBe((b.rev ?? 1) + 1);
    expect(nb.end).toBe("2027-03-06");
    expect(nb.origBac).toBeCloseTo(M.bac);
    const add = nb.items.find((i) => i.id === "CO01.1")!;
    expect(add.alloc).toEqual({ MAST: 22 });
    const paint = nb.items.find((i) => i.id === "F4.1")!;
    expect(paint.qty).toBe(500);
    expect(Object.values(paint.alloc).reduce((a, x) => a + x, 0)).toBeCloseTo(500, 1);
    expect(paint.history).toEqual([{ qty: 466.17, co: "CO-01" }]);
    expect(buildModel(nb, CALENDAR).bac).toBeCloseTo(M.bac + lv, 0);
  });
  it("cannot be applied twice", () => expect(() => applyChangeOrder(nb, "CO-01", TODAY, 0)).toThrow(/already approved/));
});
