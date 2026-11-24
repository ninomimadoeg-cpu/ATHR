-- Site Progress — starting schema (Supabase / Postgres 15)
-- Review with the owner's open questions before the first migration.

create extension if not exists "pgcrypto";

-- ---------- people ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  phone text,
  lang text not null default 'ar' check (lang in ('ar','en')),
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- projects ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- e.g. 'wg5'
  name_en text not null, name_ar text not null default '',
  location text, currency text not null default 'EGP',
  start_date date not null, end_date date not null,
  week_start smallint not null default 0,    -- 0 = Sunday
  status text not null default 'active' check (status in ('setup','active','closed')),
  baseline_rev int not null default 1,
  wp_upturn_height numeric not null default 0.30,   -- finish schedule params
  shower_wall_area numeric not null default 3.8,
  created_by uuid references profiles, created_at timestamptz not null default now()
);

create table project_members (
  project_id uuid references projects on delete cascade,
  user_id uuid references profiles on delete cascade,
  role text not null check (role in ('manager','site','viewer')),
  primary key (project_id, user_id)
);

create table trades (
  project_id uuid references projects on delete cascade,
  code text not null, name_en text not null, name_ar text not null default '', sort int default 0,
  primary key (project_id, code)
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  code text not null,                        -- 'BED1', 'GEN'
  name_en text not null, name_ar text not null default '',
  kind text not null default 'dry' check (kind in ('dry','wet','ter','gen')),
  sort int not null default 0, archived boolean not null default false,
  -- finish schedule inputs (nullable)
  length numeric, width numeric, area_override numeric, perimeter_override numeric,
  wall_height numeric, openings numeric, door_widths numeric,
  floor_code text, skirting_code text, wall1_code text, wall1_height numeric, wall2_code text,
  ceiling_code text, ceiling_painted boolean, screed7 boolean, screed25 boolean,
  waterproofing text, showers int, notes text,
  unique (project_id, code)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  code text not null, name_en text not null, name_ar text not null default '',
  trade_code text, start_date date not null, end_date date not null,
  area_id uuid references areas,             -- Phase 2: per-area sequencing (null = all areas)
  unique (project_id, code)
);

create table boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  ref text not null,                         -- stable app ref, e.g. 'F2.1'
  boq_code text, trade_code text not null,
  name_en text not null, name_ar text not null default '', description text,
  unit text not null, qty numeric not null, rate numeric not null default 0,
  measure_mode text not null default 'qty' check (measure_mode in ('qty','pct')),
  note text, sort int default 0,
  unique (project_id, ref)
);

create table item_stages (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references boq_items on delete cascade,
  code text not null, name_en text not null, name_ar text not null default '',
  weight numeric not null check (weight > 0 and weight <= 100),
  activity_id uuid references activities, sort int default 0,
  unique (item_id, code)
);

create table allocations (
  item_id uuid references boq_items on delete cascade,
  area_id uuid references areas on delete cascade,
  qty numeric not null check (qty >= 0),
  primary key (item_id, area_id)
);

create table finish_codes (
  project_id uuid references projects on delete cascade,
  code text not null,
  basis text not null check (basis in ('floor','skirting','wall','ceiling','ceiling-paint','screed7','screed25','wp-floor','wp-upturn','wp-shower')),
  description text, location text,
  item_id uuid references boq_items,
  primary key (project_id, code)
);

create table baseline_revisions (
  project_id uuid references projects on delete cascade,
  rev int not null, snapshot jsonb not null, note text,
  created_by uuid references profiles, created_at timestamptz not null default now(),
  primary key (project_id, rev)
);

-- ---------- site progress ----------
create table progress_entries (
  id uuid primary key,                        -- generated on the phone (idempotent retries)
  project_id uuid not null references projects on delete cascade,
  item_id uuid references boq_items, area_id uuid not null references areas,
  stage_id uuid references item_stages,
  work_date date not null,
  kind text not null check (kind in ('add','set','photo')),
  value numeric not null default 0,           -- add: quantity; set: fraction 0..1
  note text,
  created_by uuid not null references profiles default auth.uid(),
  created_at timestamptz not null,            -- phone clock at save time
  received_at timestamptz not null default now(),
  status text not null default 'entered' check (status in ('entered','approved','adjusted')),
  approved_by uuid references profiles, approved_at timestamptz,
  is_sample boolean not null default false
);
create index on progress_entries (project_id, work_date, created_at);

create table entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references progress_entries on delete cascade,
  storage_path text not null, taken_at timestamptz, width int, height int
);

-- ---------- helpers ----------
create function is_owner() returns boolean language sql stable security definer as
$$ select coalesce((select is_owner from profiles where id = auth.uid()), false) $$;
create function project_role(p uuid) returns text language sql stable security definer as
$$ select case when is_owner() then 'owner' else (select role from project_members where project_id = p and user_id = auth.uid()) end $$;
create function is_manager(p uuid) returns boolean language sql stable as $$ select project_role(p) in ('owner','manager') $$;
create function is_member(p uuid) returns boolean language sql stable as $$ select project_role(p) is not null $$;


-- ---------- RLS ----------
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table trades enable row level security;
alter table areas enable row level security;
alter table activities enable row level security;
alter table boq_items enable row level security;
alter table item_stages enable row level security;
alter table allocations enable row level security;
alter table finish_codes enable row level security;
alter table baseline_revisions enable row level security;
alter table progress_entries enable row level security;
alter table entry_photos enable row level security;

create policy "self or owner" on profiles for select using (id = auth.uid() or is_owner());
create policy "self update" on profiles for update using (id = auth.uid());

create policy "members read" on projects for select using (is_member(id));
create policy "owner writes" on projects for all using (is_owner()) with check (is_owner());
create policy "members read" on project_members for select using (is_member(project_id));
create policy "managers write" on project_members for all using (is_manager(project_id)) with check (is_manager(project_id));

-- baseline tables: members read, managers write
do $$ declare t text; begin
  foreach t in array array['trades','areas','activities','finish_codes'] loop
    execute format('create policy "members read" on %I for select using (is_member(project_id))', t);
    execute format('create policy "managers write" on %I for all using (is_manager(project_id)) with check (is_manager(project_id))', t);
  end loop; end $$;

-- boq_items: every member may read the rows, but the RATE column is hidden from non-managers
-- by column privileges (RLS is row-level only). Managers read rates through boq_rates().
create policy "members read" on boq_items for select using (is_member(project_id));
revoke select on boq_items from anon, authenticated;
grant select (id, project_id, ref, boq_code, trade_code, name_en, name_ar, description, unit, qty, measure_mode, note, sort)
  on boq_items to authenticated;
create function boq_rates(p uuid) returns table (id uuid, rate numeric)
  language sql stable security definer set search_path = public as
  $$ select i.id, i.rate from boq_items i where i.project_id = p and is_manager(p) $$;
create policy "managers write" on boq_items for all using (is_manager(project_id)) with check (is_manager(project_id));

create policy "members read" on item_stages for select using (exists (select 1 from boq_items i where i.id = item_id and is_member(i.project_id)));
create policy "managers write" on item_stages for all using (exists (select 1 from boq_items i where i.id = item_id and is_manager(i.project_id)));
create policy "members read" on allocations for select using (exists (select 1 from boq_items i where i.id = item_id and is_member(i.project_id)));
create policy "managers write" on allocations for all using (exists (select 1 from boq_items i where i.id = item_id and is_manager(i.project_id)));
create policy "managers" on baseline_revisions for all using (is_manager(project_id)) with check (is_manager(project_id));

create policy "members read" on progress_entries for select using (is_member(project_id));
create policy "site insert own" on progress_entries for insert
  with check (is_member(project_id) and project_role(project_id) <> 'viewer' and created_by = auth.uid()
              and (status = 'entered' or is_manager(project_id)));
create policy "manager update" on progress_entries for update using (is_manager(project_id));
create policy "delete own unapproved or manager" on progress_entries for delete
  using (is_manager(project_id) or (created_by = auth.uid() and status = 'entered'));

create policy "members read" on entry_photos for select using (exists (select 1 from progress_entries e where e.id = entry_id and is_member(e.project_id)));
create policy "author or manager insert" on entry_photos for insert with check (exists (select 1 from progress_entries e where e.id = entry_id and (e.created_by = auth.uid() or is_manager(e.project_id))));

-- Storage: bucket 'photos' (private); path photos/{project_id}/{entry_id}/{n}.jpg — add storage policies mirroring the above.
