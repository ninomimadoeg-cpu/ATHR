# Decisions and open questions

## Confirmed by the owner (24 Nov 2026)
- Project types: mixed. Start with ~20 rooms per project; two projects now, more later; one site person per project.
- BOQs come as Excel (sample: `source/WG_BOQ.xls`). Schedules will be built with Claude — format is open.
- BOQ quantities are totals; the split per area is agreed at project start (now via the finish schedule Excel).
- Progress reported as quantities and/or percentages depending on the item; some items have stages that span the project.
- Entries count when entered; the owner approves/adjusts after site visits.
- Android phones; internet "somewhat reliable but not everywhere" → offline-first is required.
- English + Arabic; most site staff use Arabic.
- Daily reports: progress only (no manpower/equipment for now).
- Weekly report goes to the owner only; he forwards it.
- For the company's own use (not a product for sale, for now).
- Site staff must not need Claude — the app has to run standalone on their phones.

## Phase 1 decisions (owner, 24 Nov 2026)
1. **Site sign-in**: phone + password; accounts created by the owner in the app; 90-day sessions. No SMS.
2. **Working calendar**: planned progress advances on **working days only, Sat–Thu (Friday off)**. Public holidays later.
   (Changes the planned reference numbers in doc 03 — recomputed in Phase 1 step 2; calendar-day results kept as a parity test.)
3. **Zero-priced BOQ lines**: stay at zero weight (tracked, don't move value %).
6. **WG5 PP-R pipes** (BOQ 4.1–4.5): lump sums tracked by %.
7. **Photos**: no GPS. **Free storage only**: photos 1280 px JPEG; storage meter with a warning at 80%; owner downloads
   zips (by project / date range, folders by date and area) to a laptop or external drive, then "free up space" deletes
   the full-size files and keeps a ~25 KB preview (archived photos show "archived on <date>").
10. **Accounts**: owner creates GitHub (repo `ninomimadoeg-cpu/ATHR`), Supabase (free, Frankfurt) and **Cloudflare Pages**
    (free plan allows business use) instead of Vercel. A daily keep-alive stops the free Supabase project pausing.
- **Users in Phase 1**: the owner is the only manager; the `manager` role stays in the schema for later.

## Still open (not blocking Phase 1 code — WG5 data, fix in the finish schedule before go-live)
4. **WG5 kitchen**: F03/C02 (plan tags + BOQ) or F01/C03 (finishing table)?
5. **WG5 fixtures**: where are the 5th WC and the 2 extra lavatories (currently "whole apartment")?
8. **Schedule detail**: one activity for all areas (as now) or sequenced per area (Bath 1 → Bath 4)? (Phase 2)
9. **Weekly report day**: weeks run Sunday→Saturday now; report on Thursday evening? (Phase 2 scheduled sending)

## Assumptions made in the WG5 baseline (to review)
- Areas and dimensions were read from the PDF drawings, not measured; irregular rooms use estimated overrides.
- MEP items were split across rooms by room size or by logic (e.g. wall splits to bedrooms + kitchen, 32 A isolators to the concealed units). Shared items (panel, cables, risers, valves, dish) sit in "Whole apartment / general".
- Stage weights (e.g. painting 45/15/40, wiring 40/40/20) are typical values, not from a contract.
- The schedule (1 Nov 2026 – 27 Feb 2027, 32 activities) is a draft so the reports work.

## Decided 24 Nov 2026 (after local testing) — see doc 07
- **Working days**: Friday only is off (Sat–Thu working). Public holidays: not yet.
- **Change order value** vs its BOQ lines: **warn** when they differ by more than 1% (and ask for a second tap to approve).
- **Site proposals**: yes — site engineers can propose a target or report a variation; the manager accepts or declines.
- **Counted items** (AC units etc.): **half units are allowed** (+0.5 button). Big items keep their stages
  (AC: first fix incl. drains 30 · unit install 50 · testing & commissioning 20, at the end of the project).
