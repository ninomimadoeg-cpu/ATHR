// "This week" to-do note: what each area needs to be on plan by the end of the week (prototype todoModel).
import { plannedFrac, stateAt, type Model } from "./progress";
import { weekRange } from "./weekly";
import type { Activity, Entry, ISODate, Item, Stage } from "./types";

export type TodoKind = "overdue" | "week" | "starts";
export interface TodoArea { area: string; f: number; target: number; q: number; need: number; nq: number }
export interface TodoLine { it: Item; st: Stage; areas: TodoArea[]; sum: number }
export interface TodoGroup { act: Activity; kind: TodoKind; lines: TodoLine[]; n: number; ok: number }
export interface Todo { start: ISODate; end: ISODate; asOf: ISODate; groups: TodoGroup[] }

export function todo(M: Model, list: Entry[], w: number, today: ISODate): Todo {
  const [ws, we] = weekRange(M, w), asOf = today < we ? today : we;
  const st = stateAt(M, asOf < ws ? today : asOf, list);
  const groups: Record<string, { act: Activity; kind: TodoKind; lines: Record<string, TodoLine>; n: number; ok: number }> = {};
  for (const K of M.keys) {
    const a = K.act;
    if (!a) continue;
    const f = st[K.k] || 0;
    let kind: TodoKind | null = null, target = 0;
    if (a.e < ws) { if (f < 1 - 1e-6) { kind = "overdue"; target = 1 } }
    else if (a.s <= we) { target = plannedFrac(a, we, M.cal); kind = a.s >= ws ? "starts" : "week" }
    if (!kind) continue;
    const g = groups[a.id] || (groups[a.id] = { act: a, kind, lines: {}, n: 0, ok: 0 });
    g.n++;
    // counted items: target rounded up to half units (owner decision: half a unit is fine)
    const whole = K.it.mode === "qty" && K.it.unit === "no.";
    const nq = K.it.mode !== "qty" ? 0 : whole ? Math.max(0, Math.ceil(target * K.q * 2 - 1e-6) / 2 - f * K.q) : (target - f) * K.q;
    const need = target - f;
    if (need <= 1e-6 || (K.it.mode === "qty" && nq < 0.005)) { g.ok++; continue }
    const lk = K.it.id + "|" + K.st.id;
    const L = g.lines[lk] || (g.lines[lk] = { it: K.it, st: K.st, areas: [], sum: 0 });
    L.areas.push({ area: K.area, need, f, target, q: K.q, nq });
    L.sum += nq;
  }
  const order = Object.values(groups).sort((x, y) => (x.act.e < y.act.e ? -1 : x.act.e > y.act.e ? 1 : 0));
  return { start: ws, end: we, asOf, groups: order.map((g) => ({ ...g, lines: Object.values(g.lines) })) };
}
