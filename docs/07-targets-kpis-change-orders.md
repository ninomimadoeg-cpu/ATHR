# Targets, KPIs and change orders

Added after testing the prototype locally (24 Nov 2026). Implemented in `prototype/index.html`; carry into Phase 1.

## Why
Some projects have incomplete drawings or no BOQ. The owner still needs to follow progress and photos,
set what the site must achieve each week/month, and monitor the site engineers. Projects also get
change orders and modifications mid-way.

## Three levels of baseline (a project can move up a level at any time)
| Level | Project has | Progress measured by |
|---|---|---|
| 1 | Name + dates only | Weekly/monthly **targets** + daily diary (photo/note per area) |
| 2 | Targets + rough BOQ or partial drawings | Targets; BOQ items as they are added |
| 3 | BOQ + area split + schedule | Value-weighted progress (doc 03), plus targets on top |

Overview and Weekly report fall back to the KPI screen when the project has no BOQ value (BAC = 0).

## Targets
- Set by the manager for a **week or a month**: description (EN + optional AR shown to site), trade, area
  (default "Whole site"), measure, weight (1 Normal, 2 Important, 3 Critical).
- Measure: **Done / not done** (two big buttons on site), **Quantity** (qty + unit, site enters today's quantity), or **Percent**.
- Stored as an item with `rate = 0`, one stage `all`, its own activity spanning the period (`tg-<id>`, `tg: true`).
  So site entry, offline outbox, photos, approvals and the to-do note need no special code, and targets never change BOQ value %.
- A target belongs to the period **it is due in** (activity end date). Month view = all targets due that month.
- **Carry over**: unfinished targets from the previous period are copied into the current one (remaining quantity), linked by `tgt.from`.

## KPIs (per week or month, as of today or the period end)
| KPI | Definition |
|---|---|
| Targets achieved | Σ weight × done fraction / Σ weight, for targets due in the period |
| Planned by now | Same with the linear planned fraction inside the period (on track vs behind) |
| Completed | Count of targets at 100% |
| Still open from earlier | Targets due before the period that aren't finished |
| Days with a site report | Working days (from project start, excluding off days — default Friday) with ≥1 entry/photo/note ÷ working days elapsed |
| Photos, entries, areas updated | Counts in the period |
| BOQ value progress | (Level 3 only, managers only) actual vs planned % and the change in the period |
| By site engineer | Days reported, entries, photos, last update per engineer |

"Copy KPI summary" produces WhatsApp text (✅ / 🟡 / ⬜ per target).

## Daily diary
"Photo / note" on any area (including "Whole site") saves an entry with a photo **or** just a note
(e.g. "tile delivery arrived"). It counts for "days with a site report" but never for progress.

## Change orders / variations
- Register per project: number (CO-01…), date, description, type (Addition / Omission / Modification / Time extension),
  value (EGP ±), extra days, requested by, note, status **pending → approved / rejected**.
- Optional BOQ lines: **add a line** (description, trade, qty, unit, rate, area, activity or "approval → end"),
  **change a quantity** (new total; area split scaled pro rata), **omit** (quantity 0).
- Approving applies the lines, extends the finish date by the extra days, bumps `rev`, and saves the previous baseline to
  `revisions/{project}-r{rev}` with the reason. Items keep `history` of old quantities and the `co` that changed them.
- Reports show **original contract → approved changes → current baseline**, and pending COs (count and value).
- Progress after a quantity change: quantity entries are kept, so done % = done quantity / new quantity
  (e.g. 100 of 200 m² done → 100 of 250 m² = 40%). Percent entries keep their %.
- Planned % for the whole project drops when work is added — expected, and visible in the S-curve.
- Level 1 projects: log the CO for value/time and add targets for the new work (`tgt.co`).

## Schema additions for Phase 1 (`supabase/schema.sql`)
- `boq_items`: `is_target bool`, `target_weight smallint`, `target_period text`, `carried_from uuid`, `change_order_id uuid`.
- `activities`: `is_target bool`.
- `projects`: `off_days smallint[] default '{5}'`, `original_bac numeric`.
- `change_orders(id, project_id, number, date, title, kind, value, extra_days, requested_by, note, status, decided_by, decided_at, revision)`
  + `change_order_lines(id, change_order_id, type add|qty|omit, item_id, description, trade, unit, qty, rate, area_id, activity_id)`.
  Applying a CO is a Postgres function (one transaction): apply lines, snapshot to `baseline_revisions`, bump revision.
- `progress_entries.kind` gains `note`.
- RLS: only owner/manager write targets and change orders; CO values hidden from site users like rates.

## Open questions (added to doc 06)
- Working days: Friday only off, or Friday + Saturday? Public holidays?
- Should a CO's typed value be checked against the value of its BOQ lines (warn if they differ)?
- Can site engineers propose a target or a variation from site (manager approves)?
