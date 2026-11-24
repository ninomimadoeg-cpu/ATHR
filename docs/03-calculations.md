# Calculations (source of truth)

Ported from `prototype/index.html` (functions `buildModel`, `plannedFrac`, `stateAt`, `agg`, `vWeekly`). Keep results identical.

## Keys and value
- A **key** is `item | area | stage` for every item, every area in the item's split (`alloc`), every stage of the item.
- `q` = the item quantity allocated to that area. `w` = stage weight in % (stages of an item sum to 100).
- **Value** `V = q × rate × w / 100`. **BAC** (budget at completion) = Σ V over all keys = BOQ total.
- Items with rate 0 (e.g. exhaust fans in WG5) have V = 0: tracked, but they don't move the %. (Open question 3.)

## Actual progress of a key at date d
Take the project's entries with `work_date ≤ d`, sorted by (`work_date`, `created_at`). For each entry on the key:
- `kind = "add"` (site, qty items): `f = clamp(f + value / q)`
- `kind = "set"` (site pct items, or manager adjustment): `f = clamp(value)` (value is a fraction 0–1)
- `kind = "photo"`: ignored for progress.

`clamp` limits to 0…1. Entries for keys that no longer exist (after a re-split) are ignored.

## Planned progress of a key at date d
Each stage links to one activity `[s, e]` (inclusive dates).
`pf = 0` if d < s; `1` if d ≥ e; else `counted days in [s, d] / counted days in [s, e]`.
**Owner decision (24 Nov 2026): counted days = working days, Sat–Thu (project `offDays`, default Friday).**
An activity made only of off days falls back to calendar days. The prototype counted calendar days; that rule is
kept in `src/core/dates.ts` (`CALENDAR`) so the parity tests below still prove the port is exact.

## Aggregates
For any group (whole project, trade, area, area × trade, activity):
- `EV(d) = Σ V·f`, `PV(d) = Σ V·pf`, `BAC = Σ V`
- Actual % = EV/BAC, Planned % = PV/BAC, **gap (points)** = (EV − PV)/BAC × 100, **SPI** = EV/PV.
- Area × trade cell = EV/BAC of that cell; flag "lagging" when actual is more than 10 points below planned.

## Weeks and the weekly report
- `w0` = project start moved back to the project's week-start weekday (WG5: Sunday; start 2026-11-01 is a Sunday so w0 = start).
- Week n = `[w0 + 7(n−1), w0 + 7(n−1) + 6]`. Number of weeks = ceil((end − w0 + 1)/7) → WG5: 17.
- For week n: `end` = week end, or today if the week is in progress; `prev` = day before week start.
  - Actual to date = EV(end)/BAC; Planned to date = PV(week end)/BAC.
  - Done this week = (EV(end) − EV(prev))/BAC; Planned this week = (PV(week end) − PV(prev))/BAC.
- **Delays** at week end: per item-stage, sum over its areas of `V × (pf − f)` where positive; show planned share `Σ V·pf / Σ V`, actual share `Σ V·f / Σ V`, value behind; top 10 by value behind.
- **S-curve**: one point per week end: planned = PV/BAC; actual = EV/BAC for weeks ending ≤ today, plus today's value for the current week.

## Reference numbers (WG5 baseline + 165 sample entries)
| Check | Expected |
|---|---|
| BAC | EGP 2,325,121 |
| As of 2026-11-24: actual / planned / SPI | 10.9% / 16.2% / 0.68 |
| Week 4 (22–28 Nov), as of 24 Nov: actual / planned to week end | 10.9% / 18.5% |
| Week 4 this week: done / planned | 2.8% / 4.2% |
| Week 4 by trade, actual vs planned | HVAC 19.4/33.1 · Electrical 18.2/28.3 · Plumbing 23.0/47.4 · Finishes 0/0 |

(Sample entries all have `status` approved before 17 Nov and `entered` after; 81 awaiting approval.)

The table above is on **calendar days** (prototype parity). With the **working-day rule** (Friday off) the app shows:

| Check | Working days |
|---|---|
| As of 2026-11-24: actual / planned / SPI | 10.9% / 16.5% / 0.66 |
| Week 4, as of 24 Nov: actual / planned to week end | 10.9% / 18.5% |
| Week 4 this week: done / planned | 2.8% / 4.2% |

Both tables are asserted in `test/core.test.ts`.

## Entry rules
- Entry IDs are client-generated (UUID) so retries never duplicate (upsert on id).
- qty entries are capped at the remaining quantity at entry time.
- Site may delete own entries while `status = entered`. Managers may delete any.
- Adjust: manager enters the verified quantity-to-date (or %) → new entry `kind=set`, `work_date = today`, `status = approved`; the reviewed entry becomes `adjusted`. It overrides everything before it; later site `add` entries stack on top.
