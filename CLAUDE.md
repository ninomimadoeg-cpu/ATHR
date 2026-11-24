# Site Progress — project brief for Claude Code

Read this file first, then `docs/`. The `prototype/` folder is a **working reference**, not the codebase:
reuse its logic and screens, but build the real app with the stack below.

## What we are building

A construction progress app for a fit-out / MEP contractor in Egypt who manages several projects remotely.

- **Site engineers** (one per project, Android phones, mostly Arabic, patchy signal) record daily progress
  **per area** (room / apartment / zone) **per BOQ item**: a quantity ("12 m² today") or a percentage, by stage
  (e.g. conduits → wiring → termination), with photos.
- **The manager/owner** sees actual vs planned progress (value-weighted against the BOQ), weekly reports,
  progress by trade and by area, photos, and approves or adjusts entries after visiting site.
- **Baseline** per project = BOQ + areas + how each BOQ quantity splits across areas + a time schedule.
  The area split comes from a **room finish schedule** filled in Excel (see `docs/04-finish-schedule.md`).

It must run **outside Claude**: site staff open it on their phones, install it to the home screen, and it works offline.

## Decisions already made (keep unless the owner says otherwise)

| Topic | Decision |
|---|---|
| App type | Installable **PWA** (Android first), one codebase for site + manager screens |
| Frontend | React + TypeScript + Vite, Tailwind, `vite-plugin-pwa` (Workbox), Dexie (IndexedDB) for the offline outbox |
| Backend | **Supabase**: Postgres + Auth + Storage + Row Level Security. Schema in `supabase/schema.sql` |
| Languages | English + Arabic with full RTL. Site screens default to Arabic, manager screens to English. Western digits in both |
| Progress maths | Exactly as `docs/03-calculations.md` (ported from the prototype — keep results identical) |
| Entries count | Immediately when saved; manager approves later; "Adjust" = a manager `set` entry (audit trail kept) |
| Quantity entry | Site enters **today's quantity** (delta) for qty items, **cumulative %** for pct items |
| Money | Site engineers never see rates or values; only managers do (enforce in RLS/views, not just the UI) |
| Excel | SheetJS for reading; ExcelJS for writing styled templates (finish schedule, BOQ split) |
| Hosting | Cloudflare Pages (frontend, free plan allows business use) + Supabase cloud free tier; the owner owns both accounts |

Open questions are listed in `docs/06-decisions-and-open-questions.md` — ask the owner before building anything that depends on one.

## Where things are

```
CLAUDE.md                      this brief
docs/01-product-spec.md        users, screens, flows, phases, acceptance criteria
docs/02-data-model.md          tables and JSON shapes
docs/03-calculations.md        progress, planned, weekly report maths (source of truth)
docs/04-finish-schedule.md     Excel room finish schedule: format + import rules
docs/05-architecture.md        stack, offline sync, auth/roles, photos, deployment, costs
docs/06-decisions-and-open-questions.md
docs/07-targets-kpis-change-orders.md   targets (no-BOQ projects), KPIs, change orders
supabase/schema.sql            starting schema with RLS policies
prototype/index.html           working single-file prototype (ran inside Claude; uses claude.use("db") etc.)
prototype/baseline-wg5.json    real baseline: West Golf Apt 5 (77 BOQ lines, 17 areas, draft schedule)
prototype/sample-wg5.json      165 sample site entries (1–23 Nov 2026) — flagged demo:true
tools/finish_schedule.py       Python reference: builds the Excel template and imports it (tested)
tools/gen_baseline.py          how the WG5 baseline was derived from the BOQ + drawings
data/WG5 Finish Schedule.xlsx  pre-filled finish schedule for WG5 (dimensions estimated from drawings)
data/wg5-rooms.json            the room data behind that workbook
source/                        the owner's original BOQ (.xls) and architectural drawings (PDF)
```

## How to work on this

- Build in the phases in `docs/01-product-spec.md`; Phase 1 must replace the prototype end to end.
- Port the calculation code first, with unit tests that reproduce the prototype's numbers on
  `prototype/baseline-wg5.json` + `prototype/sample-wg5.json` (expected values are in `docs/03-calculations.md`).
- Port `tools/finish_schedule.py` to TypeScript with the same tests (JS and Python must give identical splits).
- Test the site screens at 360–412 px wide, in Arabic, and in airplane mode.
- Never put seed or sample data in app code; load it through the import flows or a seed script.
- Keep IDs that site staff see (area codes like `BED1`, BOQ refs like `F2.1`) stable once a project is live.
