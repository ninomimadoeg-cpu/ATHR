# Site Progress — handoff kit

## The real app (Phase 1, in progress)
```bash
npm install
npm test          # calculation tests: prototype parity, working days, finish schedule = Python, KPIs, change orders
npm run dev       # app on http://localhost:5173
npm run build     # installable offline app in dist/
```
Code: `src/core/` (calculations, no UI), `src/app/` (screens), `test/`. GitHub runs the tests on every push.

## Try the prototype on your own computer (local test)
You need Python 3 (Mac: already installed; Windows: install from python.org, tick "Add to PATH").

1. Open a terminal in this folder.
2. Run `python3 local/serve.py` (Windows: `py local\serve.py`).
3. Open http://localhost:8080 → **Load project** (WG5 with sample entries).
4. Use the **Manager / Site engineer** switch at the top to see both sides.
5. To test on your Android phone: connect it to the same Wi-Fi and open the second address the
   terminal prints (http://192.168.x.x:8080).

Everything you enter is saved in `local/data/`. Delete that folder to start from zero.
Stop the server with Ctrl+C.

Everything needed to build the real (phone-ready) Site Progress app in **Claude Code**.

## How to start
1. Unzip this folder somewhere on your computer (e.g. `Documents/site-progress`).
2. Open Claude Code in that folder (`cd site-progress` then `claude`, or open the folder in the Claude desktop app's Code tab).
3. Paste this as your first message:

> Read CLAUDE.md and everything in docs/. Then ask me the open questions in docs/06 that block Phase 1,
> and propose a step-by-step plan for Phase 1 (with what I need to set up myself: Supabase and Vercel accounts).
> Don't write code until I approve the plan.

4. Claude Code will need you to create two free accounts when it gets there: **Supabase** (database, logins,
   photo storage) and **Vercel** (hosting the app). You own both, so you own your data.

## What's inside
- `CLAUDE.md` — the brief Claude Code reads automatically.
- `docs/` — product spec, data model, calculation rules, Excel finish-schedule format, architecture, open questions.
- `supabase/schema.sql` — starting database schema with access rules.
- `prototype/` — the working prototype built in Claude (reference for screens and logic) + West Golf Apt 5 data.
- `tools/` — Python scripts: build/import the finish schedule Excel; how the WG5 baseline was made.
- `data/WG5 Finish Schedule.xlsx` — the room finish schedule for Apt 5, pre-filled from the drawings (please verify).
- `source/` — your BOQ and drawings.

## Using the tools directly (optional)
```bash
pip install openpyxl
python tools/finish_schedule.py template prototype/baseline-wg5.json data/wg5-rooms.json out.xlsx
python tools/finish_schedule.py import   prototype/baseline-wg5.json "data/WG5 Finish Schedule.xlsx" new-baseline.json
```
