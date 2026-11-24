// Shapes shared by the app, the import tools and the database layer.
// They mirror the prototype baseline / entry JSON (docs/02-data-model.md, docs/07).

export type ISODate = string; // "2026-11-24"
export type Mode = "qty" | "pct" | "check";

export interface Named { id: string; en: string; ar: string }
export interface Area extends Named { kind?: string }
export type Trade = Named;

export interface Activity extends Named {
  s: ISODate; // first day (inclusive)
  e: ISODate; // last day (inclusive)
  trade: string;
  tg?: boolean; // activity that only carries a target's period
}

export interface Stage extends Named { w: number; act: string }

export interface TargetInfo {
  per: string; // "w5" | "m2026-12"
  w: number; // weight 1 Normal, 2 Important, 3 Critical
  at?: string;
  by?: string;
  from?: string; // carried over from target id
  co?: string; // created for change order
  proposal?: string; // created from a site proposal
}

export interface Item extends Named {
  code: string;
  trade: string;
  unit: string;
  qty: number;
  rate: number;
  mode: Mode;
  stages: Stage[];
  alloc: Record<string, number>;
  note?: string;
  tgt?: TargetInfo;
  co?: string;
  history?: { qty: number; co: string }[];
}

export interface ChangeOrderLine {
  type: "add" | "qty" | "omit";
  // add
  en?: string; trade?: string; qty?: number; unit?: string; rate?: number; area?: string; act?: string;
  // qty / omit
  item?: string;
}

export interface ChangeOrder {
  id: string; // CO-01
  date: ISODate;
  title: string;
  kind: string; // Addition | Omission | Modification | Time extension
  value: number;
  days: number;
  req?: string;
  note?: string;
  lines: ChangeOrderLine[];
  linesValue: number | null;
  status: "pending" | "approved" | "rejected";
  rev?: number;
  by?: string;
  decidedAt?: string;
  photos?: string[];
  proposal?: string;
}

export interface Baseline extends Named {
  location?: string;
  currency: string;
  start: ISODate;
  end: ISODate;
  weekStart: number; // 0 = Sunday … 6 = Saturday
  offDays?: number[]; // weekdays off; default [5] (Friday)
  status?: string;
  rev?: number;
  areas: Area[];
  trades: Trade[];
  acts: Activity[];
  items: Item[];
  notTracked?: string[];
  finishSchedule?: unknown;
  cos?: ChangeOrder[];
  origBac?: number;
}

export type EntryKind = "add" | "set" | "photo" | "note";
export type EntryStatus = "entered" | "approved" | "adjusted" | "pending";

export interface Entry {
  id: string;
  project: string;
  item: string;
  area: string;
  stage: string;
  date: ISODate; // work date
  kind: EntryKind;
  val: number;
  note?: string;
  photos?: string[];
  by: string;
  at: string; // created at (ISO timestamp)
  status: EntryStatus;
  demo?: boolean;
}
