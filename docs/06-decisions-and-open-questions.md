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

## Open questions — ask before building what depends on them
1. **Site sign-in**: phone + password created by the manager (recommended, free) or SMS one-time codes (costs per SMS)?
2. **Working calendar**: should planned progress spread over working days only (e.g. Sun–Thu, or Sat–Thu), with holidays?
3. **Zero-priced BOQ lines** (WG5 exhaust fans, condensate drain): leave at zero weight, or weight by an estimated rate?
4. **WG5 kitchen**: F03/C02 (plan tags + BOQ) or F01/C03 (finishing table)?
5. **WG5 fixtures**: where are the 5th WC and the 2 extra lavatories (currently "whole apartment")?
6. **WG5 PP-R water pipes** (BOQ 4.1–4.5) have no quantities — track as lump sums by %?
7. **Photos**: keep GPS location on photos? How long to keep them?
8. **Schedule detail**: one activity for all areas (as now) or sequenced per area (Bath 1 → Bath 4)?
9. **Weekly report day**: weeks run Sunday→Saturday now; report on Thursday evening?
10. **Accounts and domain**: the owner should create the Supabase and Vercel accounts (and optionally a domain) so he owns the data.

## Assumptions made in the WG5 baseline (to review)
- Areas and dimensions were read from the PDF drawings, not measured; irregular rooms use estimated overrides.
- MEP items were split across rooms by room size or by logic (e.g. wall splits to bedrooms + kitchen, 32 A isolators to the concealed units). Shared items (panel, cables, risers, valves, dish) sit in "Whole apartment / general".
- Stage weights (e.g. painting 45/15/40, wiring 40/40/20) are typical values, not from a contract.
- The schedule (1 Nov 2026 – 27 Feb 2027, 32 activities) is a draft so the reports work.

## Added 24 Nov 2026 (after local testing) — see doc 07
11. **Working days** for "days with a site report": Friday only off (current default), or Friday + Saturday? Public holidays?
12. **Change order value** vs the value of its BOQ lines: warn when they differ?
13. Can site engineers **propose** a target or a variation from site, for the manager to approve?
14. Counted items (`no.`): allow fractional entries (0.5 of an AC unit) or whole units only?
