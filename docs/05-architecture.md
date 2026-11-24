# Architecture

## Stack
- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query.
  PWA via `vite-plugin-pwa` (Workbox): precache app shell, runtime-cache the project baseline and thumbnails.
  i18n with `i18next`; `dir="rtl"` switch; fonts IBM Plex Sans Arabic + Inter (self-hosted for offline).
- **Backend**: Supabase — Postgres (schema `supabase/schema.sql`), Auth, Storage bucket `photos` (private), RLS.
  Edge Functions only where needed (Excel template generation, weekly email in Phase 2).
- **Excel**: SheetJS (`xlsx`) to read; ExcelJS to write styled templates.
- **Charts**: hand-written SVG (as in the prototype) or a light library (e.g. visx); keep bundle small for phones.
- **Hosting**: Vercel (or Netlify) for the PWA; Supabase cloud (EU region, e.g. Frankfurt, is closest to Egypt).

## Offline-first sync (site app)
- On login and on project open, cache the project's baseline (areas, items without rates, stages, activities,
  allocations) and its entries in IndexedDB (Dexie). The UI always reads from IndexedDB.
- Saving an entry writes to an **outbox** table in IndexedDB with a client UUID, plus compressed photo blobs.
- A sync worker drains the outbox when online (on `online` event, app start, every 30 s, and via Background Sync
  where supported): upload photos to Storage → upsert the entry row (idempotent on id) → mark sent.
- Pull: Supabase Realtime subscription per open project (or poll every 30 s) to refresh entries/approvals.
- Conflicts: entries are append-only events; the only mutations are status changes (manager) and deletes
  (site, own, while `entered`). Last write wins on status.
- Show "N waiting to send" and the last sync time. Never lose an entry: the outbox is only cleared after the
  server confirms.

## Auth and roles
- Supabase Auth. Recommended for site staff: **manager creates the account** (phone number as login + password,
  stored as a synthetic email like `2010xxxxxxx@site.local`), long-lived session (90 days). Phone OTP via SMS is
  possible later (needs an SMS provider; cost per message). See open question 1.
- `project_members(project_id, user_id, role)`; role ∈ owner, manager, site, viewer. Owner is global (`profiles.is_owner`).
- **RLS**: members read their projects; only owner/manager write baseline tables; site users insert entries for
  their projects and update/delete their own while `status='entered'`; the `rate` column is hidden by column
  privileges and managers read rates through the `boq_rates(project_id)` function (see `supabase/schema.sql`).

## Photos
- Compress on device (max 1600 px, JPEG 0.8 ≈ 150–300 KB). Path `photos/{project_id}/{entry_id}/{n}.jpg`.
- Store EXIF time if present; GPS optional (ask the owner).
- Signed URLs for display; thumbnails via Supabase image transformations (paid) or generate a 400 px copy on device.

## Costs (rough, Nov 2026 — verify current pricing)
- Supabase Free: 500 MB database, 1 GB storage (~4–5k photos) — fine for a pilot of two projects.
  Supabase Pro (~US$25/month) when photos grow: 100 GB storage included.
- Vercel Hobby is free for personal use; Pro (~US$20/month) for commercial use.

## Environments
- `dev` (local Supabase via CLI), `prod`. Migrations in `supabase/migrations/`. Seed script loads
  `prototype/baseline-wg5.json` (+ optional `sample-wg5.json` flagged `is_sample`).
