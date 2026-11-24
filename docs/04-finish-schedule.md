# Room finish schedule (Excel) — format and import

Purpose: the owner fills, per area, its dimensions and the finish of each surface; the app measures each area
and **splits every finish BOQ quantity across areas in proportion to the measured takeoff**. Totals always equal
the BOQ; the takeoff-vs-BOQ difference is shown (red when over 10%) but never silently changes the BOQ.

Reference implementation: `tools/finish_schedule.py` (template + import, tested) and its JS port in
`prototype/index.html` (`fsRead`, `fsMetrics`, `fsTake`, `fsApply`). Both give identical results on
`data/WG5 Finish Schedule.xlsx`.

## Workbook (generated per project)
| Sheet | Content |
|---|---|
| Read me | Instructions, legend (yellow/blue = input, grey = formula), assumptions |
| Rooms | Header row 5, data from row 6. One row per area. Inputs then calculated columns |
| Finish codes | C3 = waterproofing upturn height (m), C4 = wall area per shower (m²). Header row 7, rows from 8: Code, Basis, Description, Location, BOQ line ID, then lookups and takeoff check |
| Other items | Header row 4: BOQ ID, Trade, Description, Unit, BOQ qty, one column per Area ID (incl. GEN), Total, Check. Qty per area typed in |
| BOQ | Read-only reference used by lookups |

### Rooms columns (A…W inputs, X…AE formulas)
Area ID · Name EN · Name AR · Type (Room/Wet/Terrace) · Length · Width · Floor area override · Perimeter override ·
Wall height · Openings to deduct (m²) · Door widths (m) · Floor · Skirting · Wall finish 1 · Wall 1 up to height ·
Wall finish 2 (above) · Ceiling · Ceiling painted (Y/N) · Screed 7 cm (Y/N) · Screed 2.5 cm (Y/N) ·
Waterproofing (WPF/WPT) · Showers (no.) · Notes ‖ Floor area · Perimeter · Skirting · Wall 1 area · Wall 2 area ·
Ceiling area · WP upturn · Shower walls.

### Measurements per room
```
area      = area_override  ?? length × width
perimeter = per_override   ?? 2 × (length + width)
h1        = wall1_height blank ? wall_height : min(wall1_height, wall_height)
skirting  = skirt code ? max(0, perimeter − door_widths) : 0
wall1     = wall1 code ? max(0, perimeter × h1 − openings) : 0
wall2     = wall2 code ? perimeter × max(0, wall_height − h1) : 0
ceiling   = ceiling code ? area : 0
wp_upturn = waterproofing == "WPF" ? perimeter × upturn_height : 0
shower    = showers × shower_area
```

### Basis (column B of Finish codes) → which takeoff feeds the BOQ line
| basis | takeoff of a room |
|---|---|
| floor | area if Floor = code |
| skirting | skirting if Skirting = code |
| wall | wall1 if Wall finish 1 = code, + wall2 if Wall finish 2 = code |
| ceiling | ceiling if Ceiling = code |
| ceiling-paint | ceiling if Ceiling painted = Y |
| screed7 / screed25 | area if Screed 7 cm / 2.5 cm = Y |
| wp-floor | area if Waterproofing = code (WPF bathrooms, WPT terraces) |
| wp-upturn | wp_upturn |
| wp-shower | shower |

## Import rules
1. Read Rooms rows with a non-blank Area ID (skip "Totals"/"Example"). IDs: letters, digits, `-`, `_`; unique.
2. Unknown finish codes on a room → warning, ignored.
3. For each code with a BOQ line: takeoff per room by basis; several codes may feed one BOQ line (summed).
   `alloc[area] = round(BOQ_qty × takeoff_area / Σ takeoff, 2)`, rounding remainder added to the largest area.
4. If no room uses a code → warning, that line's split is left unchanged.
5. Other items: taken as typed; warning if the areas don't sum to the BOQ qty (±0.01).
6. Areas = Rooms rows in order, then `GEN` (whole project), then any old area still used by a split.
   Error if Other items uses an Area ID that isn't in Rooms.
7. Warn when existing site entries reference item/area/stage keys that no longer exist (they stop counting).
8. Show a **preview** (errors, warnings, per-line BOQ vs measured and % difference, number of areas) and apply
   only on confirmation. Store the parsed schedule on the project and bump the baseline revision (keep history).

## Template generation
For a new project: generate the workbook from the project's BOQ, finish codes (seed from the drawings' finishing
schedule) and areas, with formulas, dropdowns and conditional formatting as in `tools/finish_schedule.py`. Use ExcelJS
in the browser or a Supabase Edge Function. Always include one example row when the Rooms sheet is empty.

## WG5 notes
- Pre-filled values are **estimates from the PDF plans**; owner to verify on site.
- Kitchen: plan tags say F03/C02/CR1 (matches BOQ quantities); the finishing table says F01 + C03. Template follows plan + BOQ.
- C03 (fire-resistant board) has no BOQ line.
- Measured vs BOQ for WG5 is within −7.9% … +4.6% on all 16 finish lines.
