# Data model

The relational schema is in `supabase/schema.sql`. The prototype stored the same information as two JSON shapes,
which are also the **import format** for seeding the first projects.

## Concepts
- **Project** → has **trades** (F Finishes, H HVAC, E Electrical, P Plumbing), **areas**, **activities** (schedule), **BOQ items**.
- **BOQ item** → `qty`, `rate`, `unit`, `measure_mode` (`qty` = site types quantities; `pct` = site sets a %), and **stages**
  (each with a weight % and one activity). Items without phases have a single stage `all` (100%).
- **Allocation** = how much of an item's quantity sits in each area (`alloc`). Comes from the finish schedule import
  (finishes) or typed in (other items). Sum of allocations = BOQ qty.
- **Progress entry** = an event on one key (item, area, stage) on a work date: `add` (quantity), `set` (fraction), or `photo`.
- **Area `GEN`** ("whole apartment / general") holds shared items not tied to a room (panel, risers, dish…).

## Prototype baseline JSON (`prototype/baseline-wg5.json`)
```jsonc
{
  "id": "wg5", "en": "West Golf – Apartment 5", "ar": "ويست جولف – شقة ٥",
  "location": "Fifth District, New Cairo", "currency": "EGP",
  "start": "2026-11-01", "end": "2027-02-27", "weekStart": 0, "status": "draft", "rev": 1,
  "areas":  [{ "id": "BED1", "en": "Bedroom 1", "ar": "غرفة نوم ١", "kind": "dry|wet|ter|gen" }],
  "trades": [{ "id": "F", "en": "Finishes", "ar": "التشطيبات" }],
  "acts":   [{ "id": "conduit", "en": "...", "ar": "...", "s": "2026-11-01", "e": "2026-11-21", "trade": "E" }],
  "items": [{
     "id": "F4.1", "code": "4.1", "trade": "F", "en": "Wall painting (P01)", "ar": "دهانات الحوائط",
     "unit": "m²", "qty": 466.17, "rate": 220, "mode": "qty",
     "stages": [{ "id": "putty", "en": "Putty", "ar": "المعجون", "w": 45, "act": "putty" }, ...],
     "alloc": { "REC": 105.94, "LIV": 55.62, ... },
     "note": "optional"
  }],
  "notTracked": ["…"],
  "finishSchedule": { "rooms": [...], "codes": [...], "params": {...} }   // after an Excel import
}
```
Units used: `m²`, `m`, `no.`, `kg`, `LS` (Arabic: م², م.ط, عدد, كجم, مقطوعية).

## Prototype entry JSON (`prototype/sample-wg5.json`, one per entry)
```jsonc
{ "id": "20261124-lx3k9a", "project": "wg5", "item": "E3.3", "area": "KIT", "stage": "conduit",
  "date": "2026-11-24", "kind": "add|set|photo", "val": 2, "note": "", "photos": ["<asset id>"],
  "by": "<user id>", "at": "2026-11-24T13:05:00Z", "status": "entered|approved|adjusted",
  "apBy": "...", "apAt": "...", "demo": true }
```
Mapping to SQL: `date→work_date`, `val→value`, `at→created_at`, `by→created_by`, `demo→is_sample`, photos → `entry_photos`.
Prototype IDs (`F4.1`, `BED1`, `putty`) become `ref`/`code` columns; the SQL uses UUID keys.

## Stage templates used for WG5 (from `tools/gen_baseline.py`)
| Template | Stages (weight %) |
|---|---|
| ceiling | Framing 40 · Boards 40 · Joints & putty 20 |
| paint | Putty 45 · Primer 15 · Final coats 40 |
| waterproofing | Membrane 80 · Flood test 20 |
| AC unit | First fix 30 · Unit install 50 · Commissioning 20 |
| wiring | Conduits 40 · Wiring 40 · Termination 20 |
| pipes | Installation 75 · Pressure test 25 |
| copper | Installation 80 · Pressure test 20 |
| panel | Installation 60 · Termination & test 40 |
| boiler | Installation 70 · Commissioning 30 |
