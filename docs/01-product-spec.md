# Product spec

## Users and roles

| Role | Who | Can |
|---|---|---|
| owner | The company owner (the person who commissioned this) | Everything, all projects, manage users |
| manager | Office/project manager | Everything on assigned projects, including approvals and baseline |
| site | Site engineer — one per project, Android, mostly Arabic | Record progress + photos on assigned projects; edit/delete own entries until approved. **No rates or values** |
| viewer | Client / consultant (later) | Read-only reports for one project |

## Screens

### Site (phone, Arabic default)
1. **Project picker** (only if assigned to more than one).
2. **Areas grid** — big tiles: area name, % complete, planned tick, a dot if updated today. Date selector (default today, can back-date for late entries, never future).
3. **Area screen** — items grouped by trade. Default filter **"Scheduled now"** (any stage whose activity window is within ±7 days of the date and isn't finished); toggle **"All items"**. Each card shows per-stage progress bars. "Area photo" button for a photo without an item.
4. **Entry sheet** (bottom sheet):
   - Stage selector (default: first unfinished stage whose activity has started).
   - "Done so far: X of Y unit (Z%)".
   - **qty items**: big numeric field for *today's* quantity, quick buttons (+1/+2/+5 for counts, +1/+5/+10 for m²/m, +10/+25/+50 for kg) and **All remaining**. Capped at remaining.
   - **pct items**: slider (step 5) + 25/50/75/100 chips; value is cumulative.
   - Live "after saving" %, optional note, **Add photos** (opens camera; compress to 1600 px JPEG ~0.8 before upload).
   - Save → appears instantly (optimistic), queued if offline, badge "N waiting to send".
5. **Today in this area** — list of today's entries with delete (own, not yet approved).

### Manager (desktop + phone, English default, Arabic available)
1. **Overview** — headline finding ("5.2 points behind schedule"), actual % vs planned %, value earned / BAC, S-curve (weekly, planned dashed vs actual), SPI, entries awaiting approval, last site update, progress by trade (bar + planned tick), area × trade heat grid (red dot if >10 pts behind plan).
2. **Weekly report** — week picker (weeks Sunday→Saturday from project start); headline; this week achieved vs planned; table by trade and by area (planned to date, actual to date, gap, planned this week, done this week); top 10 delays by value behind; activities active this week with planned vs actual; photos of the week; **Copy summary** (WhatsApp text); **Export PDF** (Phase 2).
3. **Approvals** — grouped by date; each entry with photos and note; Approve / Adjust (enter verified quantity-to-date → creates a `set` entry, marks original `adjusted`) / Delete; "Approve all N" per day.
4. **Photos** — gallery filtered by area / date / item.
5. **Baseline** — schedule Gantt with today line; BOQ by trade with qty, rate, total, tracking mode, stages + weights, split across areas; **Download finish schedule (Excel)** / **Import filled schedule** with preview (see doc 04); baseline revision history.
6. **Portfolio** (Phase 2) — all projects: % actual vs planned, SPI, last update, pending approvals.
7. **Project setup** — create project, import BOQ Excel, define areas (or import finish schedule), stages per item (templates), schedule (build or import), invite site engineer.

## Phases

**Phase 1 — replace the prototype (MVP)**
- Auth, roles, project membership; owner can create projects and invite users.
- Project setup: import BOQ from Excel (owner's format: sheets per trade with columns ITEM No. / DESCRIPTION / UNIT / Qty / Unit Price / Total Price; see `source/WG_BOQ.xls`), plus import of `baseline-*.json` produced by `tools/` for the first projects.
- Finish schedule template download + import (doc 04). Other-items split via the same workbook.
- Stage templates (see `tools/gen_baseline.py` `SS` dict) applied per item, editable.
- Schedule: activities with start/end, each item-stage linked to one activity; edit in a table; import from Excel.
- Site entry flow above, offline-first with photo queue.
- Overview, Weekly report (+ copy summary), Approvals, Photos, Baseline screens.
- Arabic/English + RTL.

**Phase 2**
- Weekly report PDF export + optional scheduled email/WhatsApp to the owner every Thursday.
- Portfolio dashboard across projects.
- Per-area schedules (an activity can be sequenced area by area, e.g. tiling Bath 1 → Bath 4).
- Working-day calendar for planned progress (see open questions).
- Import MS Project XML / Primavera XER.
- Reminders: notify manager when a project has no entries by 6 pm on a working day.

**Phase 3**
- Client/consultant read-only links, BOQ variations with revision history, delay reasons per entry.

## Acceptance criteria (Phase 1)
- A site engineer can log a quantity for an item in an area in **≤ 4 taps** from opening the app.
- With the phone in airplane mode: entries and photos are saved, survive closing the app, and sync automatically when back online, with no duplicates.
- All site screens are fully usable in Arabic RTL at 360 px width; touch targets ≥ 44 px; inputs 16 px.
- On the WG5 baseline + sample entries, Overview shows **10.9% actual vs 16.2% planned as of 24 Nov 2026** and the Week 4 report shows **10.9% vs 18.5% planned** (same as the prototype).
- Importing `data/WG5 Finish Schedule.xlsx` produces exactly the split that `tools/finish_schedule.py import` produces.
- A site user cannot read rates, values or another project's data (verified by RLS tests).
