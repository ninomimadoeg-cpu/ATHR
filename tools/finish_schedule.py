"""
Room finish schedule <-> project baseline.

  template:  python finish_schedule.py template baseline.json rooms.json out.xlsx
  import:    python finish_schedule.py import baseline.json filled.xlsx new_baseline.json

The workbook has four sheets:
  Read me       – how to fill it in
  Rooms         – one row per area: dimensions + a finish code per surface (inputs),
                  measured quantities (formulas)
  Finish codes  – code -> what it measures -> which BOQ line it splits; takeoff vs BOQ check
  Other items   – BOQ lines that are not finishes (MEP etc.): quantity per area, typed in

Import rule: for every BOQ line fed by a finish code, the BOQ quantity is split across areas
in proportion to the measured takeoff of each area (so money totals always equal the BOQ).
The takeoff-vs-BOQ difference is reported, never silently absorbed.
Lines in "Other items" are taken exactly as typed (a warning is raised if they don't sum to the BOQ).
"""
import json, sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter as L

FONT = "Arial"
F_IN = Font(name=FONT, color="0000FF")
F_CALC = Font(name=FONT, color="000000")
F_HEAD = Font(name=FONT, bold=True, color="FFFFFF")
F_B = Font(name=FONT, bold=True)
F_T = Font(name=FONT, bold=True, size=14)
F_N = Font(name=FONT)
F_MUTE = Font(name=FONT, color="666666", italic=True)
FILL_IN = PatternFill("solid", fgColor="FFF7C2")     # cells to fill in
FILL_CALC = PatternFill("solid", fgColor="EEF1EF")   # formulas, don't edit
FILL_HEAD = PatternFill("solid", fgColor="0D0F0E")
FILL_GRP = PatternFill("solid", fgColor="B8F5D0")
THIN = Side(style="thin", color="D5DAD7")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# Rooms sheet layout -------------------------------------------------------------
HDR_ROW, FIRST = 5, 6
COLS = [  # key, header, width, kind
 ("id", "Area ID", 9, "in"), ("en", "Area name (English)", 24, "in"), ("ar", "اسم المكان", 22, "in"),
 ("type", "Type", 10, "in"), ("len", "Length (m)", 9, "in"), ("wid", "Width (m)", 9, "in"),
 ("area_ov", "Floor area override (m²)", 11, "in"), ("per_ov", "Perimeter override (m)", 11, "in"),
 ("h", "Wall height (m)", 9, "in"), ("open", "Openings to deduct (m²)", 11, "in"),
 ("doors", "Door widths (m) – off skirting", 11, "in"),
 ("floor", "Floor", 8, "in"), ("skirt", "Skirting", 8, "in"), ("wall1", "Wall finish 1", 9, "in"),
 ("wall1h", "Wall 1 up to height (m)", 10, "in"), ("wall2", "Wall finish 2 (above)", 9, "in"),
 ("ceil", "Ceiling", 8, "in"), ("cpaint", "Ceiling painted (Y/N)", 9, "in"),
 ("sc7", "Screed 7 cm (Y/N)", 8, "in"), ("sc25", "Screed 2.5 cm (Y/N)", 8, "in"),
 ("wp", "Water-proofing (WPF / WPT)", 10, "in"), ("showers", "Showers (no.)", 8, "in"),
 ("notes", "Notes", 34, "in"),
 ("c_area", "Floor area (m²)", 10, "calc"), ("c_per", "Perimeter (m)", 10, "calc"),
 ("c_skirt", "Skirting (m)", 10, "calc"), ("c_w1", "Wall 1 area (m²)", 10, "calc"),
 ("c_w2", "Wall 2 area (m²)", 10, "calc"), ("c_ceil", "Ceiling area (m²)", 10, "calc"),
 ("c_up", "WP upturn (m²)", 10, "calc"), ("c_sh", "Shower walls (m²)", 10, "calc"),
]
C = {k: L(i + 1) for i, (k, *_ ) in enumerate(COLS)}
BASES = {
 # basis: (description, how the Finish codes takeoff formula is written)
 "floor": "Floor area of rooms whose Floor = code",
 "skirting": "Skirting length of rooms whose Skirting = code",
 "wall": "Wall area of rooms whose Wall finish 1 or 2 = code",
 "ceiling": "Ceiling area of rooms whose Ceiling = code",
 "ceiling-paint": "Ceiling area of rooms with Ceiling painted = Y",
 "screed7": "Floor area of rooms with Screed 7 cm = Y",
 "screed25": "Floor area of rooms with Screed 2.5 cm = Y",
 "wp-floor": "Floor area of rooms whose Waterproofing = code",
 "wp-upturn": "Perimeter × upturn height of rooms with Waterproofing = WPF",
 "wp-shower": "Showers × wall area per shower",
}

def room_metrics(r, upturn_h, shower_area):
    """Python mirror of the Rooms formulas (used by import; must match the sheet)."""
    num = lambda v: float(v) if v not in (None, "") else None
    ln, wd, aov, pov, h = num(r.get("len")), num(r.get("wid")), num(r.get("area_ov")), num(r.get("per_ov")), num(r.get("h")) or 0
    area = aov if aov is not None else (ln or 0) * (wd or 0)
    per = pov if pov is not None else 2 * ((ln or 0) + (wd or 0))
    opn, doors = num(r.get("open")) or 0, num(r.get("doors")) or 0
    w1h = num(r.get("wall1h"))
    h1 = h if w1h is None else min(w1h, h)
    return dict(
        area=area, per=per,
        skirt=max(0, per - doors) if r.get("skirt") else 0,
        w1=max(0, per * h1 - opn) if r.get("wall1") else 0,
        w2=per * max(0, h - h1) if r.get("wall2") else 0,
        ceil=area if r.get("ceil") else 0,
        up=per * upturn_h if str(r.get("wp") or "").upper() == "WPF" else 0,
        sh=(num(r.get("showers")) or 0) * shower_area,
    )

def takeoff(r, m, code, basis):
    g = lambda k: str(r.get(k) or "").strip().upper()
    code = code.upper()
    if basis == "floor": return m["area"] if g("floor") == code else 0
    if basis == "skirting": return m["skirt"] if g("skirt") == code else 0
    if basis == "wall": return (m["w1"] if g("wall1") == code else 0) + (m["w2"] if g("wall2") == code else 0)
    if basis == "ceiling": return m["ceil"] if g("ceil") == code else 0
    if basis == "ceiling-paint": return m["ceil"] if g("cpaint") == "Y" else 0
    if basis == "screed7": return m["area"] if g("sc7") == "Y" else 0
    if basis == "screed25": return m["area"] if g("sc25") == "Y" else 0
    if basis == "wp-floor": return m["area"] if g("wp") == code else 0
    if basis == "wp-upturn": return m["up"]
    if basis == "wp-shower": return m["sh"]
    raise ValueError(f"Unknown basis '{basis}' for code {code}")

# ------------------------------------------------------------------------------------
def build(baseline, rooms_spec, out):
    items = {i["id"]: i for i in baseline["items"]}
    codes = rooms_spec["codes"]
    rooms = rooms_spec.get("rooms") or []
    params = rooms_spec.get("params", {"upturn": 0.30, "shower": 3.8})
    wb = Workbook()

    # ---------- Read me ----------
    rd = wb.active; rd.title = "Read me"
    rd.column_dimensions["A"].width = 3; rd.column_dimensions["B"].width = 110
    lines = [
     (F_T, f"Room finish schedule – {baseline['en']}"),
     (F_MUTE, f"{baseline.get('ar','')}   ·   {baseline.get('location','')}"),
     (F_N, ""),
     (F_B, "What this is for"),
     (F_N, "Fill in, for every area, its size and the finish code of each surface. The app measures each area from these"),
     (F_N, "and splits every BOQ quantity across the areas in the same proportion, so site staff can report progress per area."),
     (F_N, ""),
     (F_B, "How to fill it in"),
     (F_N, "1. Rooms sheet: one row per area. Yellow cells with blue text are yours to fill; grey cells are formulas – don't type in them."),
     (F_N, "2. Give each area a short unique Area ID (e.g. BED1, B3, T2). Keep IDs stable once site staff start reporting."),
     (F_N, "3. Length × Width gives floor area and perimeter. For L-shaped or irregular rooms, fill the two override columns instead."),
     (F_N, "4. Openings = doors + windows area on the walls (m²); it is deducted from Wall finish 1. Door widths are deducted from skirting."),
     (F_N, "5. Wall finish 1 runs from the floor up to 'Wall 1 up to height' (blank = full wall height); Wall finish 2 covers the rest above it."),
     (F_N, "   Example: bathroom tiled to 1.20 m with paint above → Wall finish 1 = CR1, height 1.20, Wall finish 2 = P01."),
     (F_N, "6. Codes must exist in the Finish codes sheet. Add new codes there and pick which BOQ line each one splits."),
     (F_N, "7. Other items sheet: type how many of each MEP/other BOQ item sits in each area. The Check column must read 0."),
     (F_N, "8. Save, then in the app open Baseline → 'Import finish schedule' and choose this file. You'll see a preview before anything changes."),
     (F_N, ""),
     (F_B, "Legend"),
     (F_IN, "Blue text on yellow = input"),
     (F_CALC, "Black text on grey = formula (calculated)"),
     (F_N, ""),
     (F_B, "Assumptions used by the formulas (edit on the Finish codes sheet, cells C3 and C4)"),
     (F_N, f"Waterproofing upturn height = {params['upturn']} m (BOQ 5.2) · wall area per shower = {params['shower']} m² (BOQ 5.3, provisional)."),
    ]
    if rooms_spec.get("prefilled_note"):
        lines += [(F_N, ""), (F_B, "About the values already filled in"), (F_N, rooms_spec["prefilled_note"])]
    for i, (f, t) in enumerate(lines, start=2):
        c = rd.cell(row=i, column=2, value=t); c.font = f
    rd.cell(row=21, column=2).fill = FILL_IN; rd.cell(row=22, column=2).fill = FILL_CALC

    # ---------- Rooms ----------
    ws = wb.create_sheet("Rooms")
    ws["A1"] = "Rooms and finishes"; ws["A1"].font = F_T
    ws["A2"] = "Yellow = fill in · Grey = calculated. One row per area. Codes → see 'Finish codes'."; ws["A2"].font = F_MUTE
    n_in = sum(1 for c in COLS if c[3] == "in")
    ws.cell(row=4, column=1, value="INPUTS").font = F_B
    ws.cell(row=4, column=n_in + 1, value="CALCULATED (do not edit)").font = F_B
    for i, (k, h, w, kind) in enumerate(COLS, start=1):
        c = ws.cell(row=HDR_ROW, column=i, value=h)
        c.font = F_HEAD; c.fill = FILL_HEAD; c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = BOX
        ws.column_dimensions[L(i)].width = w
    ws.row_dimensions[HDR_ROW].height = 46
    ws.freeze_panes = ws.cell(row=FIRST, column=3)
    n_rows = max(len(rooms) + 10, 40)
    up_ref, sh_ref = "'Finish codes'!$C$3", "'Finish codes'!$C$4"
    for r in range(FIRST, FIRST + n_rows):
        data = rooms[r - FIRST] if r - FIRST < len(rooms) else {}
        for i, (k, h, w, kind) in enumerate(COLS, start=1):
            c = ws.cell(row=r, column=i); c.border = BOX
            if kind == "in":
                v = data.get(k)
                if v not in (None, ""): c.value = v
                c.font = F_IN; c.fill = FILL_IN
                if k in ("len", "wid", "area_ov", "per_ov", "h", "open", "doors", "wall1h"): c.number_format = "0.00"
            else:
                c.font = F_CALC; c.fill = FILL_CALC; c.number_format = "0.00"
        g = lambda k: f"{C[k]}{r}"
        live = f'{g("id")}=""'
        ws[g("c_area")] = f'=IF({live},"",IF({g("area_ov")}<>"",{g("area_ov")},{g("len")}*{g("wid")}))'
        ws[g("c_per")] = f'=IF({live},"",IF({g("per_ov")}<>"",{g("per_ov")},2*({g("len")}+{g("wid")})))'
        ws[g("c_skirt")] = f'=IF(OR({live},{g("skirt")}=""),0,MAX(0,{g("c_per")}-N({g("doors")})))'
        h1 = f'IF({g("wall1h")}="",{g("h")},MIN({g("wall1h")},{g("h")}))'
        ws[g("c_w1")] = f'=IF(OR({live},{g("wall1")}=""),0,MAX(0,{g("c_per")}*{h1}-N({g("open")})))'
        ws[g("c_w2")] = f'=IF(OR({live},{g("wall2")}=""),0,{g("c_per")}*MAX(0,{g("h")}-{h1}))'
        ws[g("c_ceil")] = f'=IF(OR({live},{g("ceil")}=""),0,{g("c_area")})'
        ws[g("c_up")] = f'=IF(OR({live},UPPER({g("wp")})<>"WPF"),0,{g("c_per")}*{up_ref})'
        ws[g("c_sh")] = f'=IF({live},0,N({g("showers")})*{sh_ref})'
    last = FIRST + n_rows - 1
    # dropdowns
    dv_type = DataValidation(type="list", formula1='"Room,Wet,Terrace"', allow_blank=True)
    dv_yn = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
    dv_code = DataValidation(type="list", formula1=f"='Finish codes'!$A$8:$A${8 + len(codes) + 20}", allow_blank=True)
    dv_code.showErrorMessage = False  # allow typing new codes too
    dv_wp = DataValidation(type="list", formula1='"WPF,WPT"', allow_blank=True)
    for dv in (dv_type, dv_yn, dv_code, dv_wp): ws.add_data_validation(dv)
    dv_type.add(f"{C['type']}{FIRST}:{C['type']}{last}")
    for k in ("cpaint", "sc7", "sc25"): dv_yn.add(f"{C[k]}{FIRST}:{C[k]}{last}")
    for k in ("floor", "skirt", "wall1", "wall2", "ceil"): dv_code.add(f"{C[k]}{FIRST}:{C[k]}{last}")
    dv_wp.add(f"{C['wp']}{FIRST}:{C['wp']}{last}")
    # totals row
    tr = last + 2
    ws.cell(row=tr, column=1, value="Totals").font = F_B
    for k in ("c_area", "c_per", "c_skirt", "c_w1", "c_w2", "c_ceil", "c_up", "c_sh"):
        c = ws[f"{C[k]}{tr}"]; c.value = f"=SUM({C[k]}{FIRST}:{C[k]}{last})"; c.font = F_B; c.number_format = "0.00"
    ws[f"{C['id']}{HDR_ROW}"].comment = Comment("Short unique code, e.g. BED1. Leave the row's ID blank to ignore it.", "App")
    ws[f"{C['open']}{HDR_ROW}"].comment = Comment("Doors + windows area on this room's walls (m²). Deducted from Wall finish 1.", "App")

    # ---------- Finish codes ----------
    fc = wb.create_sheet("Finish codes")
    fc["A1"] = "Finish codes → BOQ"; fc["A1"].font = F_T
    fc["A3"] = "Waterproofing upturn height (m)"; fc["C3"] = params["upturn"]
    fc["A4"] = "Wall area per shower (m²)"; fc["C4"] = params["shower"]
    for a in ("C3", "C4"): fc[a].font = F_IN; fc[a].fill = FILL_IN; fc[a].number_format = "0.00"
    fc["D3"] = "BOQ 5.2: 30 cm upturn"; fc["D4"] = "BOQ 5.3: provisional 4 showers × approx. 3.8 m²"
    for a in ("D3", "D4"): fc[a].font = F_MUTE
    fh = ["Code", "Surface / basis", "Description", "Location (drawings)", "BOQ line (ID)", "BOQ description", "Unit",
          "BOQ qty", "Measured takeoff", "Difference", "Difference %"]
    widths = [8, 15, 30, 32, 11, 40, 7, 11, 12, 11, 11]
    for i, (h, w) in enumerate(zip(fh, widths), start=1):
        c = fc.cell(row=7, column=i, value=h); c.font = F_HEAD; c.fill = FILL_HEAD; c.border = BOX
        c.alignment = Alignment(wrap_text=True, vertical="center"); fc.column_dimensions[L(i)].width = w
    fc.row_dimensions[7].height = 32
    rng = lambda k: f"Rooms!${C[k]}${FIRST}:${C[k]}${last}"
    for j, cd in enumerate(codes + [{}] * 20):
        r = 8 + j
        it = items.get(cd.get("boq")) if cd else None
        vals = [cd.get("code"), cd.get("basis"), cd.get("desc"), cd.get("loc"), cd.get("boq")]
        for i, v in enumerate(vals, start=1):
            c = fc.cell(row=r, column=i, value=v); c.font = F_IN; c.fill = FILL_IN; c.border = BOX
        dv_b = None
        # BOQ lookups via INDEX/MATCH on the BOQ sheet
        fc.cell(row=r, column=6, value=f'=IF($E{r}="","",IFERROR(INDEX(BOQ!$C:$C,MATCH($E{r},BOQ!$A:$A,0)),"not in BOQ"))')
        fc.cell(row=r, column=7, value=f'=IF($E{r}="","",IFERROR(INDEX(BOQ!$D:$D,MATCH($E{r},BOQ!$A:$A,0)),""))')
        fc.cell(row=r, column=8, value=f'=IF($E{r}="","",IFERROR(INDEX(BOQ!$E:$E,MATCH($E{r},BOQ!$A:$A,0)),""))')
        A = f"$A{r}"
        b = (cd or {}).get("basis")
        tk = {
          "floor": f"SUMIFS({rng('c_area')},{rng('floor')},{A})",
          "skirting": f"SUMIFS({rng('c_skirt')},{rng('skirt')},{A})",
          "wall": f"SUMIFS({rng('c_w1')},{rng('wall1')},{A})+SUMIFS({rng('c_w2')},{rng('wall2')},{A})",
          "ceiling": f"SUMIFS({rng('c_ceil')},{rng('ceil')},{A})",
          "ceiling-paint": f'SUMIFS({rng("c_ceil")},{rng("cpaint")},"Y")',
          "screed7": f'SUMIFS({rng("c_area")},{rng("sc7")},"Y")',
          "screed25": f'SUMIFS({rng("c_area")},{rng("sc25")},"Y")',
          "wp-floor": f"SUMIFS({rng('c_area')},{rng('wp')},{A})",
          "wp-upturn": f"SUM({rng('c_up')})",
          "wp-shower": f"SUM({rng('c_sh')})",
        }.get(b)
        # generic fallback so rows the user adds still compute: choose by basis text in column B
        generic = (f'IF($B{r}="floor",SUMIFS({rng("c_area")},{rng("floor")},{A}),'
                   f'IF($B{r}="skirting",SUMIFS({rng("c_skirt")},{rng("skirt")},{A}),'
                   f'IF($B{r}="wall",SUMIFS({rng("c_w1")},{rng("wall1")},{A})+SUMIFS({rng("c_w2")},{rng("wall2")},{A}),'
                   f'IF($B{r}="ceiling",SUMIFS({rng("c_ceil")},{rng("ceil")},{A}),""))))')
        fc.cell(row=r, column=9, value=f'=IF($A{r}="","",{tk or generic})')
        fc.cell(row=r, column=10, value=f'=IF(OR($H{r}="",$I{r}=""),"",$I{r}-$H{r})')
        fc.cell(row=r, column=11, value=f'=IF(OR($H{r}="",$I{r}="",N($H{r})=0),"",$J{r}/$H{r})')
        for i in range(6, 12):
            c = fc.cell(row=r, column=i); c.font = F_CALC; c.fill = FILL_CALC; c.border = BOX
            c.number_format = "0.0%" if i == 11 else "0.00"
    dv_basis = DataValidation(type="list", formula1='"floor,skirting,wall,ceiling,ceiling-paint,screed7,screed25,wp-floor,wp-upturn,wp-shower"', allow_blank=True)
    fc.add_data_validation(dv_basis); dv_basis.add(f"B8:B{8 + len(codes) + 19}")
    fc.conditional_formatting.add(f"K8:K{8 + len(codes) + 19}",
        FormulaRule(formula=[f'AND(ISNUMBER(K8),ABS(K8)>0.1)'], font=Font(name=FONT, color="C8321F", bold=True)))
    end_fc = 8 + len(codes) + 21
    fc.cell(row=end_fc, column=1, value="How the app uses this: each BOQ line's quantity is split across areas in proportion to each area's measured takeoff. "
            "The total always equals the BOQ; a Difference over 10% (red) means the drawings and the BOQ disagree – worth checking.").font = F_MUTE
    fc.cell(row=end_fc + 1, column=1, value="Basis options: " + " · ".join(f"{k} = {v}" for k, v in BASES.items())).font = F_MUTE

    # ---------- Other items ----------
    oi = wb.create_sheet("Other items")
    oi["A1"] = "Other BOQ items per area (MEP etc.)"; oi["A1"].font = F_T
    oi["A2"] = "Type the quantity of each item in each area. Check must be 0. Column GEN = whole apartment / not tied to a room."; oi["A2"].font = F_MUTE
    finish_ids = {c["boq"] for c in codes if c.get("boq")}
    other = [i for i in baseline["items"] if i["id"] not in finish_ids]
    area_ids = [r["id"] for r in rooms] + ["GEN"] if rooms else [a["id"] for a in baseline["areas"]]
    if "GEN" not in area_ids: area_ids.append("GEN")
    hdr = ["BOQ ID", "Trade", "Description", "Unit", "BOQ qty"] + area_ids + ["Total", "Check"]
    for i, h in enumerate(hdr, start=1):
        c = oi.cell(row=4, column=i, value=h); c.font = F_HEAD; c.fill = FILL_HEAD; c.border = BOX
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center" if i > 5 else "left")
        oi.column_dimensions[L(i)].width = {1: 8, 2: 10, 3: 36, 4: 6, 5: 9}.get(i, 7)
    oi.freeze_panes = "F5"
    tname = {t["id"]: t["en"] for t in baseline["trades"]}
    a0, a1 = 6, 5 + len(area_ids)
    for j, it in enumerate(other):
        r = 5 + j
        vals = [it["id"], tname.get(it["trade"], it["trade"]), it["en"], it["unit"], it["qty"]]
        for i, v in enumerate(vals, start=1):
            c = oi.cell(row=r, column=i, value=v); c.font = F_N; c.border = BOX
        for k, aid in enumerate(area_ids):
            c = oi.cell(row=r, column=a0 + k); c.font = F_IN; c.fill = FILL_IN; c.border = BOX
            q = (it.get("alloc") or {}).get(aid)
            if q: c.value = q
        tc = oi.cell(row=r, column=a1 + 1, value=f"=SUM({L(a0)}{r}:{L(a1)}{r})")
        ck = oi.cell(row=r, column=a1 + 2, value=f"=ROUND({L(a1 + 1)}{r}-E{r},2)")
        for c in (tc, ck): c.font = F_CALC; c.fill = FILL_CALC; c.border = BOX; c.number_format = "0.##;-0.##;0"
    oi.conditional_formatting.add(f"{L(a1 + 2)}5:{L(a1 + 2)}{4 + len(other)}",
        FormulaRule(formula=[f"{L(a1 + 2)}5<>0"], font=Font(name=FONT, color="C8321F", bold=True), fill=PatternFill("solid", fgColor="FDE8E4")))

    # ---------- BOQ (reference, read-only) ----------
    bq = wb.create_sheet("BOQ")
    bq["A1"] = "BOQ reference (from the project baseline – don't edit here)"; bq["A1"].font = F_B
    for i, h in enumerate(["BOQ ID", "Code", "Description", "Unit", "Qty", "Rate (EGP)", "Total (EGP)"], start=1):
        c = bq.cell(row=3, column=i, value=h); c.font = F_HEAD; c.fill = FILL_HEAD
    for j, it in enumerate(baseline["items"]):
        r = 4 + j
        for i, v in enumerate([it["id"], it["code"], it["en"], it["unit"], it["qty"], it["rate"]], start=1):
            bq.cell(row=r, column=i, value=v).font = F_N
        bq.cell(row=r, column=7, value=f"=E{r}*F{r}").font = F_CALC
        for col in ("F", "G"): bq[f"{col}{r}"].number_format = "#,##0;(#,##0);-"
    for col, w in zip("ABCDEFG", [8, 8, 46, 6, 10, 12, 14]): bq.column_dimensions[col].width = w
    tr2 = 4 + len(baseline["items"]) + 1
    bq.cell(row=tr2, column=3, value="Total").font = F_B
    bq.cell(row=tr2, column=7, value=f"=SUM(G4:G{tr2 - 2})").font = F_B
    bq[f"G{tr2}"].number_format = "#,##0"

    for s in wb.worksheets:
        s.sheet_view.showGridLines = s.title not in ("Read me",)
    wb.save(out)

# ------------------------------------------------------------------------------------
def read(path):
    wb = load_workbook(path, data_only=False)
    ws = wb["Rooms"]
    keys = [k for k, *_ in COLS]
    rooms = []
    for row in ws.iter_rows(min_row=FIRST, values_only=True):
        r = {k: row[i] for i, k in enumerate(keys) if i < len(row) and COLS[i][3] == "in"}
        rid = str(r.get("id") or "").strip()
        if not rid or rid.lower() in ("totals", "example"): continue
        r["id"] = rid
        for k in ("floor", "skirt", "wall1", "wall2", "ceil", "wp", "cpaint", "sc7", "sc25", "type"):
            if isinstance(r.get(k), str): r[k] = r[k].strip()
        rooms.append(r)
    fc = wb["Finish codes"]
    params = {"upturn": float(fc["C3"].value or 0.3), "shower": float(fc["C4"].value or 0)}
    codes = []
    for row in fc.iter_rows(min_row=8, max_col=5, values_only=True):
        code, basis, desc, loc, boq = row
        if code and basis:
            codes.append({"code": str(code).strip(), "basis": str(basis).strip(), "desc": desc, "loc": loc,
                          "boq": str(boq).strip() if boq else None})
    oi = wb["Other items"]
    hdr = [c.value for c in oi[4]]
    ti = hdr.index("Total")
    area_cols = [(i, str(h).strip()) for i, h in enumerate(hdr[5:ti], start=5) if h]
    other = {}
    for row in oi.iter_rows(min_row=5, values_only=True):
        if not row[0]: continue
        al = {}
        for i, aid in area_cols:
            v = row[i]
            if isinstance(v, (int, float)) and v: al[aid] = float(v)
        other[str(row[0]).strip()] = al
    return dict(rooms=rooms, codes=codes, params=params, other=other)

def apply(baseline, parsed):
    """Return (new_baseline, report). Does not touch site entries."""
    b = json.loads(json.dumps(baseline))
    items = {i["id"]: i for i in b["items"]}
    rep = {"errors": [], "warnings": [], "finish": [], "other": []}
    rooms = parsed["rooms"]
    ids = [r["id"] for r in rooms]
    dup = {x for x in ids if ids.count(x) > 1}
    if dup: rep["errors"].append(f"Duplicate Area IDs: {', '.join(sorted(dup))}")
    known_codes = {c["code"].upper() for c in parsed["codes"]}
    for r in rooms:
        for k, lbl in (("floor", "Floor"), ("skirt", "Skirting"), ("wall1", "Wall 1"), ("wall2", "Wall 2"), ("ceil", "Ceiling")):
            v = str(r.get(k) or "").strip().upper()
            if v and v not in ("-", "–") and v not in known_codes:
                rep["warnings"].append(f"{r['id']}: {lbl} code '{v}' is not in Finish codes – ignored")
    p = parsed["params"]
    metrics = {r["id"]: room_metrics(r, p["upturn"], p["shower"]) for r in rooms}
    # finish-coded BOQ lines
    by_item = {}
    for cd in parsed["codes"]:
        if not cd.get("boq"): continue
        if cd["boq"] not in items:
            rep["warnings"].append(f"Code {cd['code']}: BOQ line '{cd['boq']}' not found"); continue
        if cd["basis"] not in BASES:
            rep["errors"].append(f"Code {cd['code']}: unknown basis '{cd['basis']}'"); continue
        t = by_item.setdefault(cd["boq"], {})
        for r in rooms:
            v = takeoff(r, metrics[r["id"]], cd["code"], cd["basis"])
            if v > 0: t[r["id"]] = t.get(r["id"], 0) + v
    for iid, t in by_item.items():
        it = items[iid]; tot = sum(t.values())
        if tot <= 0:
            rep["warnings"].append(f"{iid} {it['en']}: no area uses its finish code – split left unchanged"); continue
        alloc = {a: round(it["qty"] * v / tot, 2) for a, v in t.items()}
        k = max(alloc, key=alloc.get); alloc[k] = round(alloc[k] + it["qty"] - sum(alloc.values()), 2)
        rep["finish"].append({"id": iid, "en": it["en"], "unit": it["unit"], "boq": it["qty"], "takeoff": round(tot, 2),
                              "diff_pct": round((tot - it["qty"]) / it["qty"] * 100, 1) if it["qty"] else None, "areas": len(alloc)})
        it["alloc"] = alloc
    # other items, as typed
    for iid, al in parsed["other"].items():
        if iid in by_item: continue
        if iid not in items: rep["warnings"].append(f"Other items: '{iid}' not in BOQ – ignored"); continue
        it = items[iid]; tot = round(sum(al.values()), 4)
        if not al: rep["warnings"].append(f"{iid} {it['en']}: no areas given – split left unchanged"); continue
        if abs(tot - it["qty"]) > 0.01:
            rep["warnings"].append(f"{iid} {it['en']}: areas add up to {tot:g} but BOQ is {it['qty']:g}")
        it["alloc"] = {a: round(v, 4) for a, v in al.items()}
        rep["other"].append({"id": iid, "total": tot, "boq": it["qty"]})
    # areas: rooms in sheet order, then GEN, then any old area still referenced
    old = {a["id"]: a for a in b["areas"]}
    kind = {"room": "dry", "wet": "wet", "terrace": "ter"}
    areas = [{"id": r["id"], "en": r.get("en") or r["id"], "ar": r.get("ar") or r.get("en") or r["id"],
              "kind": kind.get(str(r.get("type") or "").lower(), old.get(r["id"], {}).get("kind", "dry"))} for r in rooms]
    used = {a for it in b["items"] for a in (it.get("alloc") or {})}
    for aid in ["GEN"] + [a for a in old if a not in ids and a != "GEN"]:
        if aid in used or aid == "GEN":
            if aid not in [a["id"] for a in areas]:
                areas.append(old.get(aid, {"id": aid, "en": aid, "ar": aid, "kind": "gen"}))
    missing = sorted(used - {a["id"] for a in areas})
    if missing: rep["errors"].append(f"Area IDs used in Other items but not in Rooms: {', '.join(missing)}")
    b["areas"] = areas
    b["finishSchedule"] = {"rooms": rooms, "codes": parsed["codes"], "params": p}
    b["rev"] = int(b.get("rev", 1)) + 1
    return b, rep

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "template":
        build(json.load(open(sys.argv[2])), json.load(open(sys.argv[3])), sys.argv[4])
    elif cmd == "import":
        nb, rep = apply(json.load(open(sys.argv[2])), read(sys.argv[3]))
        json.dump(nb, open(sys.argv[4], "w"), ensure_ascii=False, separators=(",", ":"))
        print(json.dumps(rep, ensure_ascii=False, indent=1))
