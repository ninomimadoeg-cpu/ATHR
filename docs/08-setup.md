# Setup and operations (owner)

## Accounts
| Service | Account | Notes |
|---|---|---|
| GitHub | `ninomimadoeg-cpu/ATHR` | Code. Every push runs the tests (Actions). |
| Supabase | project `orbmaaqrkrnfvzygipjd`, Frankfurt, Free | Database, logins, photos. Never share the database password. |
| Cloudflare Pages | (Step 8) | Hosts the app from the `main` branch. |

## Database changes
**Applied automatically**: when a change to `supabase/migrations/` reaches `main`, the GitHub action
"Deploy database" applies it to Supabase. It needs two secrets in GitHub (Settings → Secrets and variables → Actions):
`SUPABASE_ACCESS_TOKEN` (Supabase → your avatar → Account preferences → Access Tokens → Generate) and
`SUPABASE_DB_PASSWORD` (the database password you chose; reset it in Supabase → Project Settings → Database if lost).
You can re-run it from GitHub → Actions → Deploy database → Run workflow.

All changes are files in `supabase/migrations/`, applied in name order. They are tested on every push
(`test/db.test.ts`: site engineers can't read rates/values/change orders or other projects; duplicates rejected; etc.).
`supabase/tests/supabase-stub.sql` is for tests only and must never be run on the real project.

## Making the owner account (once, after the first migration)
1. Supabase → **Authentication → Users → Add user**: your email + a strong password. Tick "Auto confirm".
2. Supabase → **SQL Editor** → run (replace the email):
   ```sql
   update public.profiles set is_owner = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up" (accounts are created from the app).

Site engineers are created from the app by the owner (phone number + password; Step 4).

## Free-tier housekeeping
- Photos: Settings shows storage used; download and free space from the Photo archive screen (docs/06 #7).
- A free project pauses after ~7 days without activity; a daily keep-alive is added in Step 8.
