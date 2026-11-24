// Change orders — docs/07. Pure functions: the database applies the same rules in one transaction.
import { addDays } from "./dates";
import type { Baseline, ChangeOrder, ChangeOrderLine, ISODate } from "./types";

/** Value of a change order's BOQ lines, worked out against the baseline before it is applied. */
export function linesValue(b: Baseline, lines: ChangeOrderLine[]): number | null {
  if (!lines.length) return null;
  let v = 0;
  for (const l of lines) {
    if (l.type === "add") v += (l.qty || 0) * (l.rate || 0);
    else {
      const it = b.items.find((i) => i.id === l.item);
      if (it) v += ((l.type === "omit" ? 0 : l.qty || 0) - it.qty) * it.rate;
    }
  }
  return Math.round(v * 100) / 100;
}

/** Owner decision: warn when the typed value differs from the lines by more than 1% (minimum EGP 1). */
export const valueMismatch = (c: Pick<ChangeOrder, "value" | "linesValue">) =>
  c.linesValue != null && Math.abs((+c.value || 0) - c.linesValue) > Math.max(1, Math.abs(c.linesValue) * 0.01);

export const nextCoNumber = (b: Baseline) => "CO-" + String((b.cos?.length || 0) + 1).padStart(2, "0");

export interface ApplyResult { baseline: Baseline; previous: Baseline; warnings: string[] }

/**
 * Approve a pending change order: add lines, change/omit quantities (area split scaled pro rata),
 * extend the finish date, bump the revision. Returns the new baseline and the one it replaces (to keep as a revision).
 */
export function applyChangeOrder(prev: Baseline, coId: string, today: ISODate, bac: number, decidedAt = ""): ApplyResult {
  const b: Baseline = structuredClone(prev);
  const c = b.cos?.find((x) => x.id === coId);
  if (!c) throw new Error(`${coId} not found`);
  if (c.status !== "pending") throw new Error(`${coId} is already ${c.status}`);
  if (b.origBac == null) b.origBac = bac;
  const warnings: string[] = [];
  const prefix = c.id.replace("-", "");
  for (const l of c.lines) {
    if (l.type === "add") {
      const iid = `${prefix}.${b.items.filter((i) => i.id.startsWith(prefix + ".")).length + 1}`;
      let act = l.act;
      if (!act) {
        act = "co-" + iid;
        b.acts.push({ id: act, en: l.en || iid, ar: l.en || iid, s: today, e: addDays(b.end, +c.days || 0), trade: l.trade || "G" });
      }
      b.items.push({
        id: iid, code: iid, trade: l.trade || "G", en: l.en || iid, ar: l.en || iid, unit: l.unit || "", qty: l.qty || 0, rate: l.rate || 0,
        mode: "qty", stages: [{ id: "all", en: "All", ar: "الكل", w: 100, act }], alloc: { [l.area || "GEN"]: l.qty || 0 }, co: c.id,
      });
    } else {
      const it = b.items.find((i) => i.id === l.item);
      if (!it) { warnings.push(`${l.item} not found`); continue }
      const nq = l.type === "omit" ? 0 : l.qty || 0, k = it.qty ? nq / it.qty : 0;
      it.history = (it.history || []).concat({ qty: it.qty, co: c.id });
      for (const a of Object.keys(it.alloc)) it.alloc[a] = +(it.alloc[a] * k).toFixed(3);
      it.qty = nq; it.co = c.id;
    }
  }
  if (+c.days > 0) b.end = addDays(b.end, +c.days);
  b.rev = (+(b.rev ?? 1) || 1) + 1;
  c.status = "approved"; c.rev = b.rev; c.decidedAt = decidedAt;
  return { baseline: b, previous: prev, warnings };
}
