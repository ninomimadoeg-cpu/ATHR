"""How the West Golf Apt 5 baseline was derived from WG_BOQ.xls and the drawings (areas, stage templates, draft schedule,
proposed area split, sample entries). Writes baseline.json and demo_entries.json in the current folder.
The finish-schedule import (finish_schedule.py) now replaces the finish-item split made here."""
import json, random, math
from datetime import date, timedelta

random.seed(7)

# ---------- AREAS (approx. from architecture plan, West Golf Apt 5) ----------
# id, en, ar, kind, floor m2 (approx), perimeter m (approx)
AREAS = [
 ("REC","Reception","الاستقبال","dry",58.7,40),
 ("LIV","Living room","المعيشة","dry",26.6,21),
 ("COR","Corridors","الطرقات","dry",27.4,42),
 ("MAID","Maid room","غرفة الخادمة","dry",2.0,6),
 ("BED1","Bedroom 1","غرفة نوم ١","bed",19.9,18),
 ("BED2","Bedroom 2","غرفة نوم ٢","bed",18.0,17),
 ("MAST","Master bedroom","غرفة النوم الرئيسية","bed",29.0,22),
 ("DRS","Dressing room","غرفة الملابس","bed",5.7,10),
 ("KIT","Kitchen","المطبخ","wet",20.1,19),
 ("B1","Bathroom 1 (guest)","حمام ١ (الضيوف)","wet",2.6,6.5),
 ("B2","Bathroom 2 (maid)","حمام ٢ (الخادمة)","wet",1.8,5.5),
 ("B3","Bathroom 3","حمام ٣","wet",7.7,10.6),
 ("B4","Bathroom 4 (master)","حمام ٤ (الرئيسي)","wet",10.5,13),
 ("T1","Terrace 1 (reception)","تراس ١ (الاستقبال)","ter",5.7,9),
 ("T2","Terrace 2 (bedroom 2)","تراس ٢ (غرفة نوم ٢)","ter",5.6,9.5),
 ("T3","Terrace 3 (master)","تراس ٣ (الرئيسية)","ter",3.39,8),
 ("GEN","Whole apartment / general","عام – الشقة كاملة","gen",0,0),
]
A = {a[0]: a for a in AREAS}
DRY = ["REC","LIV","COR","MAID","BED1","BED2","MAST","DRS"]
F01R = ["REC","LIV","COR","MAID"]
BEDS = ["BED1","BED2","MAST","DRS"]
WET = ["KIT","B1","B2","B3","B4"]
BATHS = ["B1","B2","B3","B4"]
TER = ["T1","T2","T3"]
INTERIOR = DRY + WET

def by(field, rooms):
    i = 4 if field == "area" else 5
    return {r: A[r][i] for r in rooms}

def split_cont(total, weights, dp=2):
    s = sum(weights.values())
    out = {k: round(total * w / s, dp) for k, w in weights.items()}
    keys = list(out)
    diff = round(total - sum(out.values()), dp)
    out[keys[0]] = round(out[keys[0]] + diff, dp)
    return out

def split_int(total, weights):
    s = sum(weights.values())
    raw = {k: total * w / s for k, w in weights.items()}
    out = {k: int(math.floor(v)) for k, v in raw.items()}
    rem = total - sum(out.values())
    for k in sorted(raw, key=lambda k: raw[k] - out[k], reverse=True)[:rem]:
        out[k] += 1
    return {k: v for k, v in out.items() if v}

def fixed(d):
    return dict(d)

# ---------- STAGE SETS ----------
SS = {
 "ceil":  [("frame","Framing","الهيكل المعدني",40),("board","Boards","تركيب الألواح",40),("joint","Joints & putty","معالجة الفواصل",20)],
 "paint": [("putty","Putty","المعجون",45),("primer","Primer","البرايمر",15),("finish","Final coats","الوش النهائي",40)],
 "wp":    [("memb","Membrane","طبقات العزل",80),("flood","Flood test","اختبار الغمر",20)],
 "ac":    [("first","First fix","التأسيس",30),("unit","Unit install","تركيب الوحدات",50),("comm","Commissioning","التشغيل",20)],
 "wire":  [("conduit","Conduits","المواسير",40),("wire","Wiring","سحب الأسلاك",40),("term","Termination","التوصيل النهائي",20)],
 "pipe":  [("inst","Installation","التركيب",75),("test","Pressure test","اختبار الضغط",25)],
 "cu":    [("inst","Installation","التركيب",80),("test","Pressure test","اختبار الضغط",20)],
 "panel": [("inst","Installation","التركيب",60),("test","Termination & test","التوصيل والاختبار",40)],
 "boil":  [("inst","Installation","التركيب",70),("comm","Commissioning","التشغيل",30)],
}

# ---------- ACTIVITIES (draft schedule) ----------
ACTS = [
 ("conduit","Electrical conduits (1st fix)","تمديد مواسير الكهرباء","2026-11-01","2026-11-21","E"),
 ("plumbPipe","Plumbing pipes & valves","تمديد مواسير السباكة","2026-11-01","2026-11-21","P"),
 ("acFirst","AC first fix (copper & drains)","تأسيس التكييف","2026-11-08","2026-11-28","H"),
 ("duct","Ductwork","الدكت","2026-11-15","2026-12-12","H"),
 ("plumbTest","Plumbing pressure test","اختبار ضغط السباكة","2026-11-22","2026-11-28","P"),
 ("wiring","Electrical wiring","سحب الأسلاك","2026-11-22","2026-12-19","E"),
 ("drains","Floor & shower drains","الصفايات","2026-11-29","2026-12-05","P"),
 ("wp","Waterproofing","العزل المائي","2026-11-29","2026-12-12","F"),
 ("floodTest","Flood test","اختبار الغمر","2026-12-06","2026-12-12","F"),
 ("ceilFrame","Ceiling framing","هيكل الأسقف","2026-12-06","2026-12-26","F"),
 ("ductIns","Duct insulation","عزل الدكت","2026-12-06","2026-12-19","H"),
 ("screed","Screeds","مونة التسوية","2026-12-13","2026-12-26","F"),
 ("panel","Distribution board & cables","اللوحة والكابلات","2026-12-20","2027-01-02","E"),
 ("ceilBoard","Ceiling boards","ألواح الجبس","2026-12-20","2027-01-09","F"),
 ("wallTiles","Wall tiling","سيراميك الحوائط","2026-12-27","2027-01-23","F"),
 ("ceilJoint","Ceiling joints & putty","معالجة فواصل الأسقف","2027-01-03","2027-01-16","F"),
 ("tilesFloor","Floor tiling","تركيب الأرضيات","2027-01-03","2027-01-30","F"),
 ("putty","Putty (walls & ceilings)","المعجون","2027-01-10","2027-01-30","F"),
 ("primer","Primer","البرايمر","2027-01-24","2027-02-06","F"),
 ("skirtP","Porcelain skirting","وزرة البورسلين","2027-01-31","2027-02-06","F"),
 ("acInstall","AC unit installation","تركيب وحدات التكييف","2027-01-31","2027-02-13","H"),
 ("boiler","Boiler installation","تركيب السخان","2027-01-31","2027-02-13","P"),
 ("diffusers","Diffusers & grilles","مخارج الهواء","2027-02-07","2027-02-13","H"),
 ("fans","Exhaust fans","الشفاطات","2027-02-07","2027-02-13","H"),
 ("finishPaint","Final paint coats","الوش النهائي","2027-02-07","2027-02-20","F"),
 ("hdf","HDF flooring & skirting","أرضيات ووزرة HDF","2027-02-07","2027-02-20","F"),
 ("devices","Sockets & switches","الأفياش والمفاتيح","2027-02-07","2027-02-20","E"),
 ("fixtures","Light fixtures","وحدات الإضاءة","2027-02-14","2027-02-27","E"),
 ("sanitary","Sanitary connections","توصيلات الأجهزة الصحية","2027-02-14","2027-02-27","P"),
 ("acComm","AC testing & commissioning","تشغيل التكييف","2027-02-21","2027-02-27","H"),
 ("elecTest","Electrical testing","اختبار الكهرباء","2027-02-21","2027-02-27","E"),
 ("finalComm","Final commissioning","التشغيل النهائي","2027-02-21","2027-02-27","P"),
]

ITEMS = []
def item(id, code, trade, en, ar, unit, qty, rate, mode, ss, acts, alloc, note=None):
    if isinstance(acts, str): acts = [acts]
    stages = SS[ss] if ss else [("all","Complete","التنفيذ",100)]
    assert len(acts) == len(stages), id
    it = dict(id=id, code=code, trade=trade, en=en, ar=ar, unit=unit, qty=qty,
              rate=round(rate, 2), mode=mode,
              stages=[dict(id=s[0], en=s[1], ar=s[2], w=s[3], act=a) for s, a in zip(stages, acts)],
              alloc=alloc)
    if note: it["note"] = note
    tot = round(sum(alloc.values()), 2)
    assert abs(tot - qty) < 0.02, (id, tot, qty)
    ITEMS.append(it)

C = lambda total, w: split_cont(total, w)
I = lambda total, w: split_int(total, w)

# FINISHES (BOQ sheet "Finishes")
item("F1.1","1.1","F","Gypsum ceiling C01","سقف جبس بورد C01","m²",186.98,330,"qty","ceil",["ceilFrame","ceilBoard","ceilJoint"],C(186.98,by("area",DRY+BEDS[:0])))
item("F1.2","1.2","F","Moisture-resistant ceiling C02","سقف جبس مقاوم للرطوبة C02","m²",44.09,350,"qty","ceil",["ceilFrame","ceilBoard","ceilJoint"],C(44.09,by("area",WET)))
item("F2.1","2.1","F","Porcelain floor 120×60 (F01)","أرضيات بورسلين ١٢٠×٦٠","m²",114.73,1200,"qty",None,"tilesFloor",C(114.73,by("area",F01R)))
item("F2.2","2.2","F","HDF flooring (F02)","أرضيات HDF","m²",72.25,1000,"qty",None,"hdf",C(72.25,by("area",BEDS)))
item("F2.3","2.3","F","Ceramic floor 60×60 (F03)","أرضيات سيراميك ٦٠×٦٠","m²",44.09,1200,"qty",None,"tilesFloor",C(44.09,by("area",WET)))
item("F3.1","3.1","F","Porcelain skirting (S01)","وزرة بورسلين","m",93.48,350,"qty",None,"skirtP",C(93.48,by("perim",F01R)))
item("F3.2","3.2","F","HDF skirting (S02)","وزرة HDF","m",59.96,200,"qty",None,"hdf",C(59.96,by("perim",BEDS)))
item("F4.1","4.1","F","Wall painting (P01)","دهانات الحوائط","m²",466.17,220,"qty","paint",["putty","primer","finishPaint"],C(466.17,by("perim",DRY)))
item("F4.2","4.2","F","Ceramic wall tiles (CR1)","سيراميك الحوائط","m²",175.42,2100,"qty",None,"wallTiles",C(175.42,by("perim",WET)))
item("F4.3","4.3","F","Ceiling painting","دهانات الأسقف","m²",231.07,250,"qty","paint",["putty","primer","finishPaint"],C(231.07,by("area",INTERIOR)))
item("F5.1","5.1","F","Waterproofing – bathroom floors","عزل أرضيات الحمامات","m²",23.97,460,"qty","wp",["wp","floodTest"],C(23.97,by("area",BATHS)))
item("F5.2","5.2","F","Waterproofing – bathroom upturn 30 cm","عزل وزرة الحمامات ٣٠ سم","m²",11.77,460,"qty",None,"wp",C(11.77,by("perim",BATHS)))
item("F5.3","5.3","F","Waterproofing – shower walls (provisional)","عزل حوائط الدش","m²",15.2,460,"qty",None,"wp",C(15.2,{b:1 for b in BATHS}))
item("F5.4","5.4","F","Waterproofing – terraces","عزل التراسات","m²",14.69,460,"qty","wp",["wp","floodTest"],C(14.69,by("area",TER)))
item("F6.1","6.1","F","Screed 2.5 cm (wet areas & terraces)","مونة تسوية ٢٫٥ سم","m²",40,100,"qty",None,"screed",C(40,by("area",BATHS+TER)))
item("F6.2","6.2","F","Screed 7 cm (all floors)","مونة تسوية ٧ سم","m²",231.07,250,"qty",None,"screed",C(231.07,by("area",INTERIOR)))

# HVAC
item("H1.1","1.1","H","Concealed split 24,000 Btu","تكييف كونسيلد ٢٤٠٠٠","no.",2,62000,"qty","ac",["acFirst","acInstall","acComm"],{"REC":1,"LIV":1})
item("H1.2","1.2","H","Wall split 12,000 Btu","تكييف حائطي ١٢٠٠٠","no.",1,24500,"qty","ac",["acFirst","acInstall","acComm"],{"MAID":1})
item("H1.3","1.3","H","Wall split 18,000 Btu","تكييف حائطي ١٨٠٠٠","no.",4,35000,"qty","ac",["acFirst","acInstall","acComm"],{"BED1":1,"BED2":1,"MAST":1,"KIT":1})
item("H2.1","2.1","H","Axial exhaust fan 150 CFM","شفاط ١٥٠ CFM","no.",3,0,"qty",None,"fans",{"B1":1,"B3":1,"B4":1},"No rate in BOQ")
item("H2.2","2.2","H","Axial exhaust fan 100 CFM","شفاط ١٠٠ CFM","no.",1,0,"qty",None,"fans",{"B2":1},"No rate in BOQ")
item("H2.3","2.3","H","Inline fan 150 CFM","شفاط خطي ١٥٠ CFM","no.",2,0,"qty",None,"fans",{"GEN":2},"No rate in BOQ")
item("H2.4","2.4","H","Axial exhaust fan 150 CFM (kitchen)","شفاط مطبخ ١٥٠ CFM","no.",1,0,"qty",None,"fans",{"KIT":1},"No rate in BOQ")
item("H3","3","H","Ductwork","مجاري الهواء (الدكت)","kg",350,145,"pct",None,"duct",{"REC":175,"LIV":175})
item("H4","4","H","Duct thermal insulation","عزل حراري للدكت","m²",40,312,"qty",None,"ductIns",{"REC":20,"LIV":20})
item("H5","5","H","Copper pipes & cables","مواسير نحاس وكابلات","m",40,1300,"qty","cu",["acFirst","acComm"],{"GEN":40})
item("H6","6","H","Acoustic insulation 13 mm","عزل صوتي ١٣ مم","m²",20,540,"qty",None,"ductIns",{"REC":10,"LIV":10})
item("H7","7","H","PVC condensate drain","صرف التكييف PVC","LS",1,0,"pct",None,"acFirst",{"GEN":1},"No rate in BOQ")
item("H8.1","8.1","H","Supply linear diffuser","مخرج هواء خطي – إمداد","m",14.4,1800,"qty",None,"diffusers",{"REC":7.2,"LIV":7.2})
item("H8.2","8.2","H","Return linear diffuser","مخرج هواء خطي – راجع","m",14.4,1500,"qty",None,"diffusers",{"REC":7.2,"LIV":7.2})
item("H8.3","8.3","H","Exhaust louver 150×150","لوفر طرد","no.",2,540,"qty",None,"diffusers",{"GEN":2})
item("H8.4","8.4","H","Exhaust grille 150×150","جريلة شفط","no.",2,540,"qty",None,"diffusers",{"GEN":2})

# ELECTRICAL
W_POWER = {"REC":3,"LIV":3,"KIT":4,"BED1":2,"BED2":2,"MAST":3,"MAID":1}
item("E1","1-1-1","E","Distribution board LPP-01","لوحة التوزيع LPP-01","no.",1,69000,"pct","panel",["panel","elecTest"],{"GEN":1})
item("E2.1","2-1-1","E","Cable 4×16 mm²","كابل ٤×١٦ مم²","m",10,950,"qty",None,"panel",{"GEN":10})
item("E2.2","2-2-1","E","Earth cable 1×10 mm²","كابل أرضي ١×١٠ مم²","m",10,170,"qty",None,"panel",{"GEN":10})
item("E3.1","3-1","E","Outlet wiring 3×6 mm²","توصيلات مخارج ٣×٦","no.",2,11900,"qty","wire",["conduit","wiring","devices"],{"KIT":1,"GEN":1})
item("E3.2","3-2","E","Outlet wiring 3×3 mm²","توصيلات مخارج ٣×٣","no.",40,1600,"qty","wire",["conduit","wiring","devices"],I(40,by("area",INTERIOR)))
item("E3.3","3-3","E","Power outlet wiring 3×4 mm²","توصيلات باور ٣×٤","no.",18,2900,"qty","wire",["conduit","wiring","devices"],fixed(W_POWER))
item("E4.1","4-1","E","Single socket 16A","بريزة مفردة","no.",14,380,"qty",None,"devices",I(14,by("area",INTERIOR)))
item("E4.2","4-2","E","Weatherproof socket 16A","بريزة معزولة WP","no.",9,750,"qty",None,"devices",{"KIT":2,"B1":1,"B2":1,"B3":1,"B4":1,"T1":1,"T2":1,"T3":1})
item("E4.3","4-3","E","Duplex socket 16A","بريزة مزدوجة","no.",18,870,"qty",None,"devices",fixed(W_POWER))
item("E4.4","4-4","E","Power socket 20A","بريزة باور ٢٠ أمبير","no.",13,570,"qty",None,"devices",{"KIT":4,"REC":2,"LIV":2,"MAST":2,"BED1":1,"BED2":1,"MAID":1})
item("E4.5","4-5","E","Isolator 20A (wall splits)","سكينة ٢٠ أمبير","no.",5,700,"qty",None,"devices",{"BED1":1,"BED2":1,"MAST":1,"KIT":1,"MAID":1})
item("E4.6","4-6","E","Isolator 32A (concealed units)","سكينة ٣٢ أمبير","no.",2,750,"qty",None,"devices",{"REC":1,"LIV":1})
item("E4.7","4-7","E","1-gang switch","مفتاح فردي","no.",15,550,"qty",None,"devices",I(15,by("area",INTERIOR)))
item("E4.8","4-8","E","2-gang switch","مفتاح مزدوج","no.",7,750,"qty",None,"devices",I(7,by("area",DRY)))
item("E4.9","4-9","E","2-way 1-gang switch","مفتاح ديفياتير فردي","no.",8,850,"qty",None,"devices",{"COR":2,"BED1":2,"BED2":2,"MAST":2})
item("E4.10","4-10","E","2-way 2-gang switch","مفتاح ديفياتير مزدوج","no.",3,850,"qty",None,"devices",{"REC":1,"LIV":1,"COR":1})
item("E5.1","5-1","E","Lighting points wiring","مخارج الإنارة","no.",135,1450,"qty","wire",["conduit","wiring","fixtures"],I(135,by("area",INTERIOR)))
item("E5.2","5-2","E","Recessed spotlights","سبوت لايت غاطس","no.",100,475,"qty",None,"fixtures",I(100,by("area",DRY+["KIT"])))
item("E5.3","5-3","E","Track lights","تراك لايت","no.",7,500,"qty",None,"fixtures",{"LIV":4,"REC":3})
item("E5.4","5-4","E","Wall lights","إضاءة حائط (أبليك)","no.",24,600,"qty",None,"fixtures",{"REC":6,"LIV":4,"COR":6,"BED1":2,"BED2":2,"MAST":4})
item("E5.5","5-5","E","Pendant lighting","إضاءة معلقة","m",8,700,"qty",None,"fixtures",{"REC":4,"KIT":2,"LIV":2})
item("E6.1","6-1","E","Data outlet (conduit + Cat6)","مخرج داتا Cat6","no.",6,4250,"qty","wire",["conduit","wiring","devices"],{"LIV":1,"REC":1,"BED1":1,"BED2":1,"MAST":1,"GEN":1})
item("E6.2","6-2","E","RJ45 data socket","بريزة داتا RJ45","no.",4,600,"qty",None,"devices",{"LIV":1,"BED1":1,"BED2":1,"MAST":1})
item("E6.3","6-3","E","Wi-Fi access point (PoE)","أكسس بوينت واي فاي","no.",2,32000,"qty",None,"devices",{"REC":1,"COR":1})
item("E13.1","13-1","E","TV outlet (RG6 to roof)","مخرج تليفزيون RG6","no.",4,4150,"qty","wire",["conduit","wiring","devices"],{"LIV":1,"BED1":1,"BED2":1,"MAST":1})
item("E13.2","13-2","E","Satellite dish","طبق الدش","no.",1,7000,"qty",None,"devices",{"GEN":1})
item("E13.3","13-3","E","LNB 8 ports","LNB ٨ مخارج","no.",1,900,"qty",None,"devices",{"GEN":1})
item("E13.4","13-4","E","TV socket","بريزة تليفزيون","no.",4,550,"qty",None,"devices",{"LIV":1,"BED1":1,"BED2":1,"MAST":1})

# PLUMBING
item("P1","1","P","uPVC drain pipe 4\"","مواسير صرف ٤ بوصة","m",12,691.03,"qty","pipe",["plumbPipe","plumbTest"],{"GEN":12})
item("P2","2","P","uPVC drain pipe 3\"","مواسير صرف ٣ بوصة","m",6,363.94,"qty","pipe",["plumbPipe","plumbTest"],{"GEN":6})
item("P3","3","P","uPVC drain pipe 2\"","مواسير صرف ٢ بوصة","m",24,151.40,"qty","pipe",["plumbPipe","plumbTest"],{"GEN":24})
item("P5","5","P","Floor drain","صفاية أرضية","no.",6,775.94,"qty",None,"drains",{"B1":1,"B2":1,"B3":1,"B4":1,"KIT":1,"T1":1})
item("P6","6","P","Shower drain","صفاية دش","no.",4,2920.63,"qty",None,"drains",{"B1":1,"B2":1,"B3":1,"B4":1})
item("P7","7","P","WC connection","توصيل مرحاض","no.",5,869.44,"qty",None,"sanitary",{"B1":1,"B2":1,"B3":1,"B4":1,"GEN":1},"5th WC location to confirm")
item("P8","8","P","Lavatory connection","توصيل حوض","no.",7,869.44,"qty",None,"sanitary",{"B1":1,"B2":1,"B3":1,"B4":2,"GEN":2},"2 lavatories location to confirm")
item("P9","9","P","Kitchen sink connection","توصيل حوض المطبخ","no.",2,869.44,"qty",None,"sanitary",{"KIT":2})
item("P10","10","P","Gas boiler 24 kW","سخان غاز ٢٤ ك.و","no.",1,65000,"pct","boil",["boiler","finalComm"],{"GEN":1})
for sub,(d,q,r) in {"11.1":("½\"",60,413.44),"11.2":("¾\"",18,566.88),"11.3":("1\"",18,771.25),"11.4":("1¼\"",6,1290.31)}.items():
    item("P"+sub,sub,"P",f"Ball valve {d}",f"محبس {d}","no.",q,r,"qty",None,"plumbPipe",{"GEN":q})
for sub,(d,q,r) in {"12.1":("½\"",28,438.75),"12.2":("¾\"",5,438.75),"12.3":("1\"",5,700)}.items():
    item("P"+sub,sub,"P",f"Concealed valve {d}",f"محبس دفن {d}","no.",q,r,"qty",None,"plumbPipe",{"GEN":q})
item("P13.1","13.1","P","Angle valve ½\"","محبس زاوية ½","no.",28,171.25,"qty",None,"sanitary",{"GEN":28})

TRADES = [("F","Finishes","التشطيبات"),("H","HVAC","التكييف"),("E","Electrical","الكهرباء"),("P","Plumbing","السباكة")]

baseline = dict(
  id="wg5", en="West Golf – Apartment 5", ar="ويست جولف – شقة ٥",
  location="Fifth District, New Cairo", currency="EGP",
  start="2026-11-01", end="2027-02-27", weekStart=0,  # weeks run Sunday→Saturday
  areas=[dict(id=a[0], en=a[1], ar=a[2], kind=a[3]) for a in AREAS],
  trades=[dict(id=t[0], en=t[1], ar=t[2]) for t in TRADES],
  acts=[dict(id=a[0], en=a[1], ar=a[2], s=a[3], e=a[4], trade=a[5]) for a in ACTS],
  items=ITEMS,
  notTracked=["Plumbing 4.1–4.5 PP-R water pipes: no quantities in BOQ"],
  status="draft",
)
bac = sum(i["qty"]*i["rate"] for i in ITEMS)
print("items", len(ITEMS), "BAC", round(bac,2))
js = json.dumps(baseline, ensure_ascii=False, separators=(",",":"))
print("baseline bytes", len(js.encode()))
open("baseline.json","w").write(js)

# ---------- DEMO ENTRIES (sample data, flagged demo:true) ----------
D0 = date(2026,11,1)
def d(n): return (D0 + timedelta(days=n)).isoformat()
entries = []
def add(item_id, area, stage, day, kind, val, note=""):
    entries.append(dict(project="wg5", item=item_id, area=area, stage=stage, date=d(day),
                        kind=kind, val=val, note=note, by="sample", demo=True,
                        status="approved" if day < 16 else "entered",
                        at=d(day)+"T15:%02d:00" % random.randint(0,59), photos=[]))
IT = {i["id"]: i for i in ITEMS}
def qty_progress(iid, stage, target, days):
    it = IT[iid]
    for area, q in it["alloc"].items():
        goal = q * target * random.uniform(0.75, 1.15)
        goal = min(goal, q)
        if it["unit"] == "no.": goal = round(goal)
        if goal <= 0: continue
        n = len(days)
        parts = [random.uniform(0.6, 1.4) for _ in days]
        s = sum(parts); done = 0
        for k, dy in enumerate(days):
            v = goal * parts[k] / s
            v = round(v) if it["unit"] == "no." else round(v, 1)
            if k == n - 1: v = round(goal - done, 1) if it["unit"] != "no." else int(goal - done)
            if v > 0:
                add(iid, area, stage, dy, "add", v); done += v
def pct_progress(iid, stage, area, steps):
    for dy, p in steps: add(iid, area, stage, dy, "set", p)

# Electrical conduits: planned 100% by Nov 21 — actual ~78%
for iid in ["E3.2","E3.3","E5.1","E6.1","E13.1","E3.1"]:
    qty_progress(iid, "conduit", 0.8, [2,5,9,12,16,19,22])
# Plumbing pipes & valves: ~95%
for iid in ["P1","P2","P3"]:
    qty_progress(iid, "inst", 0.95, [1,4,8,11,15,18])
for iid in ["P11.1","P11.2","P12.1"]:
    qty_progress(iid, "all", 0.7, [10,15,19])
# AC first fix: planned ~75% at Nov 23 — actual ~55%
for iid in ["H1.1","H1.2","H1.3"]:
    for area in IT[iid]["alloc"]:
        pct_progress(iid, "first", area, [(9,0.2),(14,0.45),(20,random.choice([0.5,0.6,0.7]))])
qty_progress("H5","inst",0.5,[9,13,18,22])
pct_progress("H7","all","GEN",[(12,0.3),(19,0.5)])
# Ductwork: planned ~30% — actual ~20%
pct_progress("H3","all","REC",[(15,0.1),(20,0.25)])
pct_progress("H3","all","LIV",[(18,0.1)])
# Plumbing pressure test started (Nov 22): 1 of 3 lines
add("P1","GEN","test",22,"set",1.0,"Tested 4\" line at 6 bar – OK")
entries.sort(key=lambda e: e["at"])
print("demo entries", len(entries))
open("demo_entries.json","w").write(json.dumps(entries, ensure_ascii=False))
