-- Site Progress — Phase 1 schema (Supabase / Postgres 15+)
-- Source: supabase/schema.sql (handoff kit) + docs/07 (targets, KPIs, change orders, proposals) + docs/06 decisions.
-- Money rule (CLAUDE.md): site engineers never read rates, values or change-order money. Enforced here, not in the UI.

create extension if not exists "pgcrypto";

-- =====================================================================================================
-- people
-- =====================================================================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  phone text,
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

-- every new login gets a profile; the owner flag is only ever set by hand (see docs/08-setup.md)
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================================================
-- projects and baseline
-- =====================================================================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                         -- e.g. 'wg5'
  name_en text not null,
  name_ar text not null default '',
  location text,
  currency text not null default 'EGP',
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  week_start smallint not null default 0 check (week_start between 0 and 6),
  off_days smallint[] not null default '{5}',        -- owner decision: Friday off
  status text not null default 'active' check (status in ('setup', 'active', 'closed')),
  baseline_rev int not null default 1,
  wp_upturn_height numeric not null default 0.30,
  shower_wall_area numeric not null default 3.8,
  not_tracked text[] not null default '{}',
  created_by uuid references public.profiles,
  created_at timestamptz not null default now()
);

-- money that belongs to the project as a whole: managers only
create table public.project_finance (
  project_id uuid primary key references public.projects on delete cascade,
  original_bac numeric                                -- set when the first change order is approved
);

create table public.project_members (
  project_id uuid references public.projects on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  role text not null check (role in ('manager', 'site', 'viewer')),
  primary key (project_id, user_id)
);

create table public.trades (
  project_id uuid references public.projects on delete cascade,
  code text not null,
  name_en text not null,
  name_ar text not null default '',
  sort int not null default 0,
  primary key (project_id, code)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,24}$'),   -- 'BED1', 'GEN' — stable once live
  name_en text not null,
  name_ar text not null default '',
  kind text not null default 'dry' check (kind in ('dry', 'wet', 'ter', 'gen', 'bed')),
  sort int not null default 0,
  archived boolean not null default false,
  unique (project_id, code)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  code text not null,
  name_en text not null,
  name_ar text not null default '',
  trade_code text,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  is_target boolean not null default false,          -- the period of a weekly / monthly target
  area_id uuid references public.areas,              -- Phase 2: per-area sequencing
  sort int not null default 0,
  unique (project_id, code)
);

create table public.boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  ref text not null,                                 -- 'F2.1', 'T…', 'CO01.1' — stable once live
  boq_code text,
  trade_code text not null,
  name_en text not null,
  name_ar text not null default '',
  description text,
  unit text not null default '',
  qty numeric not null check (qty >= 0),
  rate numeric not null default 0,                   -- HIDDEN from non-managers (column privileges below)
  measure_mode text not null default 'qty' check (measure_mode in ('qty', 'pct', 'check')),
  note text,
  sort int not null default 0,
  -- targets (docs/07): no money, own activity spanning the week/month they are due
  is_target boolean not null default false,
  target_weight smallint check (target_weight between 1 and 3),
  target_period text,                                -- 'w5' | 'm2026-12'
  carried_from uuid references public.boq_items on delete set null,
  proposal_id uuid,                                  -- created from a site proposal
  change_order_id uuid,                              -- added / changed by a change order
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  unique (project_id, ref),
  check (not is_target or rate = 0)
);

create table public.item_stages (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.boq_items on delete cascade,
  code text not null,
  name_en text not null,
  name_ar text not null default '',
  weight numeric not null check (weight > 0 and weight <= 100),
  activity_id uuid references public.activities on delete set null,
  sort int not null default 0,
  unique (item_id, code)
);

create table public.allocations (
  item_id uuid references public.boq_items on delete cascade,
  area_id uuid references public.areas on delete cascade,
  qty numeric not null check (qty >= 0),
  primary key (item_id, area_id)
);

create table public.finish_codes (
  project_id uuid references public.projects on delete cascade,
  code text not null,
  basis text not null check (basis in ('floor', 'skirting', 'wall', 'ceiling', 'ceiling-paint', 'screed7', 'screed25', 'wp-floor', 'wp-upturn', 'wp-shower')),
  description text,
  location text,
  item_id uuid references public.boq_items on delete set null,
  primary key (project_id, code)
);

-- the parsed room finish schedule as last imported (inputs per room); managers only
create table public.finish_schedules (
  project_id uuid primary key references public.projects on delete cascade,
  schedule jsonb not null,
  imported_by uuid references public.profiles,
  imported_at timestamptz not null default now()
);

-- previous baselines (contain rates): managers only
create table public.baseline_revisions (
  project_id uuid references public.projects on delete cascade,
  rev int not null,
  snapshot jsonb not null,
  note text,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  primary key (project_id, rev)
);

-- =====================================================================================================
-- change orders (docs/07): managers only — site users report variations through proposals
-- =====================================================================================================
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  number text not null,                              -- 'CO-01'
  co_date date not null default current_date,
  title text not null,
  kind text not null default 'Addition' check (kind in ('Addition', 'Omission', 'Modification', 'Time extension')),
  value numeric not null default 0,
  lines_value numeric,                               -- value of its BOQ lines when logged (mismatch warning)
  extra_days int not null default 0 check (extra_days >= 0),
  requested_by text,
  note text,
  photos text[] not null default '{}',
  proposal_id uuid,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  revision int,
  created_by uuid references public.profiles default auth.uid(),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles,
  decided_at timestamptz,
  unique (project_id, number)
);

create table public.change_order_lines (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders on delete cascade,
  type text not null check (type in ('add', 'qty', 'omit')),
  item_id uuid references public.boq_items on delete set null,   -- qty / omit; the new item after an add is applied
  description text, trade_code text, unit text,
  qty numeric, rate numeric,
  area_id uuid references public.areas,
  activity_id uuid references public.activities,
  old_qty numeric,                                   -- filled when applied (history)
  sort int not null default 0
);

alter table public.boq_items add constraint boq_items_change_order_fk
  foreign key (change_order_id) references public.change_orders on delete set null;

-- =====================================================================================================
-- site progress
-- =====================================================================================================
create table public.progress_entries (
  id uuid primary key,                               -- generated on the phone (idempotent retries)
  project_id uuid not null references public.projects on delete cascade,
  item_id uuid references public.boq_items on delete set null,
  area_id uuid not null references public.areas,
  stage_id uuid references public.item_stages on delete set null,
  work_date date not null,
  kind text not null check (kind in ('add', 'set', 'photo', 'note')),
  value numeric not null default 0,                  -- add: quantity; set: fraction 0..1
  note text check (char_length(note) <= 500),
  created_by uuid not null references public.profiles default auth.uid(),
  created_at timestamptz not null,                   -- phone clock at save time
  received_at timestamptz not null default now(),
  status text not null default 'entered' check (status in ('entered', 'approved', 'adjusted')),
  approved_by uuid references public.profiles,
  approved_at timestamptz,
  is_sample boolean not null default false,
  check (kind in ('photo', 'note') or (item_id is not null and stage_id is not null)),
  check (kind <> 'set' or value between 0 and 1),
  check (kind <> 'add' or value >= 0)
);
create index on public.progress_entries (project_id, work_date, created_at);

create table public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.progress_entries on delete cascade,
  storage_path text not null,                        -- {project_id}/{entry_id}/{n}.jpg in bucket 'photos'
  thumb_path text,                                   -- ~400 px preview kept after archiving
  bytes int,
  taken_at timestamptz,
  width int, height int,
  archived_at timestamptz                            -- full-size file deleted after the owner downloaded it
);
create index on public.entry_photos (entry_id);

-- site proposals: a target or a variation reported from site (docs/07)
create table public.proposals (
  id uuid primary key,                               -- generated on the phone (queued offline like entries)
  project_id uuid not null references public.projects on delete cascade,
  kind text not null check (kind in ('target', 'variation')),
  text text not null check (char_length(text) between 1 and 300),
  area_id uuid references public.areas,
  trade_code text,
  requested_by text check (requested_by in ('Client', 'Consultant', 'Site condition')),
  photos text[] not null default '{}',
  work_date date not null default current_date,
  created_by uuid not null references public.profiles default auth.uid(),
  created_at timestamptz not null default now(),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined')),
  ref text,                                          -- target ref or CO number it became
  decided_by uuid references public.profiles,
  decided_at timestamptz
);

-- =====================================================================================================
-- integrity: anything an entry / allocation / proposal points at must belong to the same project
-- =====================================================================================================
create function public.check_same_project() returns trigger
  language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if tg_table_name = 'allocations' then
    select project_id into p from boq_items where id = new.item_id;
    if not exists (select 1 from areas where id = new.area_id and project_id = p) then
      raise exception 'area and item belong to different projects';
    end if;
    return new;
  end if;
  if new.area_id is not null and not exists (select 1 from areas where id = new.area_id and project_id = new.project_id) then
    raise exception 'area % is not in this project', new.area_id;
  end if;
  if tg_table_name = 'progress_entries' then
    if new.item_id is not null and not exists (select 1 from boq_items where id = new.item_id and project_id = new.project_id) then
      raise exception 'item % is not in this project', new.item_id;
    end if;
    if new.stage_id is not null and not exists (select 1 from item_stages where id = new.stage_id and item_id = new.item_id) then
      raise exception 'stage % is not a stage of item %', new.stage_id, new.item_id;
    end if;
  end if;
  return new;
end $$;
create trigger same_project before insert or update on public.progress_entries for each row execute function public.check_same_project();
create trigger same_project before insert or update on public.proposals for each row execute function public.check_same_project();
create trigger same_project before insert or update on public.allocations for each row execute function public.check_same_project();

-- =====================================================================================================
-- role helpers
-- =====================================================================================================
create function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce((select is_owner from profiles where id = auth.uid()), false) $$;

create function public.project_role(p uuid) returns text
  language sql stable security definer set search_path = public as
$$ select case when is_owner() then 'owner'
               else (select role from project_members where project_id = p and user_id = auth.uid()) end $$;

create function public.is_manager(p uuid) returns boolean
  language sql stable set search_path = public as $$ select coalesce(project_role(p) in ('owner', 'manager'), false) $$;
create function public.is_member(p uuid) returns boolean
  language sql stable set search_path = public as $$ select project_role(p) is not null $$;
create function public.can_record(p uuid) returns boolean
  language sql stable set search_path = public as $$ select coalesce(project_role(p) in ('owner', 'manager', 'site'), false) $$;

-- =====================================================================================================
-- row level security
-- =====================================================================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_finance enable row level security;
alter table public.project_members enable row level security;
alter table public.trades enable row level security;
alter table public.areas enable row level security;
alter table public.activities enable row level security;
alter table public.boq_items enable row level security;
alter table public.item_stages enable row level security;
alter table public.allocations enable row level security;
alter table public.finish_codes enable row level security;
alter table public.finish_schedules enable row level security;
alter table public.baseline_revisions enable row level security;
alter table public.change_orders enable row level security;
alter table public.change_order_lines enable row level security;
alter table public.progress_entries enable row level security;
alter table public.entry_photos enable row level security;
alter table public.proposals enable row level security;

-- profiles: yourself, the owner, and people who share a project with you (names on entries)
create policy "read" on public.profiles for select using (
  id = auth.uid() or is_owner()
  or exists (select 1 from project_members a join project_members b on a.project_id = b.project_id
             where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- nobody may make themselves owner: is_owner is not updatable by users
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, lang) on public.profiles to authenticated;

create policy "members read" on public.projects for select using (is_member(id));
create policy "owner insert" on public.projects for insert with check (is_owner());
create policy "managers update" on public.projects for update using (is_manager(id)) with check (is_manager(id));
create policy "owner delete" on public.projects for delete using (is_owner());

create policy "managers" on public.project_finance for all using (is_manager(project_id)) with check (is_manager(project_id));

create policy "members read" on public.project_members for select using (is_member(project_id));
create policy "managers write" on public.project_members for all using (is_manager(project_id)) with check (is_manager(project_id));

do $$ declare t text; begin
  foreach t in array array['trades', 'areas', 'activities', 'finish_codes'] loop
    execute format('create policy "members read" on public.%I for select using (is_member(project_id))', t);
    execute format('create policy "managers write" on public.%I for all using (is_manager(project_id)) with check (is_manager(project_id))', t);
  end loop;
end $$;

-- boq_items: members read the rows, but RATE is hidden by column privileges (RLS is row-level only).
-- Managers read rates through boq_rates(project).
create policy "members read" on public.boq_items for select using (is_member(project_id));
create policy "managers write" on public.boq_items for all using (is_manager(project_id)) with check (is_manager(project_id));
revoke select on public.boq_items from anon, authenticated;
grant select (id, project_id, ref, boq_code, trade_code, name_en, name_ar, description, unit, qty, measure_mode, note, sort,
              is_target, target_weight, target_period, carried_from, proposal_id, change_order_id, created_by, created_at)
  on public.boq_items to authenticated;

create function public.boq_rates(p uuid) returns table (id uuid, rate numeric)
  language sql stable security definer set search_path = public as
$$ select i.id, i.rate from boq_items i where i.project_id = p and is_manager(p) $$;

create policy "members read" on public.item_stages for select
  using (exists (select 1 from boq_items i where i.id = item_id and is_member(i.project_id)));
create policy "managers write" on public.item_stages for all
  using (exists (select 1 from boq_items i where i.id = item_id and is_manager(i.project_id)))
  with check (exists (select 1 from boq_items i where i.id = item_id and is_manager(i.project_id)));
create policy "members read" on public.allocations for select
  using (exists (select 1 from boq_items i where i.id = item_id and is_member(i.project_id)));
create policy "managers write" on public.allocations for all
  using (exists (select 1 from boq_items i where i.id = item_id and is_manager(i.project_id)))
  with check (exists (select 1 from boq_items i where i.id = item_id and is_manager(i.project_id)));

create policy "managers" on public.finish_schedules for all using (is_manager(project_id)) with check (is_manager(project_id));
create policy "managers" on public.baseline_revisions for all using (is_manager(project_id)) with check (is_manager(project_id));
create policy "managers" on public.change_orders for all using (is_manager(project_id)) with check (is_manager(project_id));
create policy "managers" on public.change_order_lines for all
  using (exists (select 1 from change_orders c where c.id = change_order_id and is_manager(c.project_id)))
  with check (exists (select 1 from change_orders c where c.id = change_order_id and is_manager(c.project_id)));

-- entries: members read; site inserts its own as 'entered'; managers approve/adjust; site deletes own until approved
create policy "members read" on public.progress_entries for select using (is_member(project_id));
create policy "record own" on public.progress_entries for insert with check (
  can_record(project_id) and created_by = auth.uid()
  and ((status = 'entered' and approved_by is null) or is_manager(project_id)));
create policy "manager update" on public.progress_entries for update using (is_manager(project_id)) with check (is_manager(project_id));
create policy "delete own unapproved or manager" on public.progress_entries for delete
  using (is_manager(project_id) or (created_by = auth.uid() and status = 'entered'));

create policy "members read" on public.entry_photos for select
  using (exists (select 1 from progress_entries e where e.id = entry_id and is_member(e.project_id)));
create policy "author or manager insert" on public.entry_photos for insert
  with check (exists (select 1 from progress_entries e where e.id = entry_id
                      and (e.created_by = auth.uid() or is_manager(e.project_id))));
create policy "manager update" on public.entry_photos for update
  using (exists (select 1 from progress_entries e where e.id = entry_id and is_manager(e.project_id)));
create policy "author unapproved or manager delete" on public.entry_photos for delete
  using (exists (select 1 from progress_entries e where e.id = entry_id
                 and (is_manager(e.project_id) or (e.created_by = auth.uid() and e.status = 'entered'))));

-- proposals: site sees and creates its own; managers see all and decide
create policy "own or manager read" on public.proposals for select using (created_by = auth.uid() or is_manager(project_id));
create policy "record own" on public.proposals for insert with check (
  can_record(project_id) and created_by = auth.uid() and status = 'proposed' and decided_by is null);
create policy "manager decide" on public.proposals for update using (is_manager(project_id)) with check (is_manager(project_id));

-- =====================================================================================================
-- approve a change order in one transaction (docs/07): snapshot → apply lines → extend end → bump revision
-- =====================================================================================================
create function public.project_snapshot(p uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'project', (select to_jsonb(x) from projects x where x.id = p),
    'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort, a.code) from areas a where a.project_id = p), '[]'),
    'activities', coalesce((select jsonb_agg(to_jsonb(a) order by a.start_date, a.code) from activities a where a.project_id = p), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
        'stages', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort) from item_stages s where s.item_id = i.id), '[]'),
        'alloc', coalesce((select jsonb_object_agg(ar.code, al.qty) from allocations al join areas ar on ar.id = al.area_id where al.item_id = i.id), '{}'))
      order by i.sort, i.ref) from boq_items i where i.project_id = p), '[]'))
$$;
revoke execute on function public.project_snapshot(uuid) from public, anon, authenticated;

create function public.project_bac(p uuid) returns numeric
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(al.qty * i.rate), 0) from boq_items i join allocations al on al.item_id = i.id where i.project_id = p
$$;
revoke execute on function public.project_bac(uuid) from public, anon, authenticated;

create function public.apply_change_order(co uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare
  c change_orders%rowtype;
  pr projects%rowtype;
  l change_order_lines%rowtype;
  it boq_items%rowtype;
  new_item uuid; new_act uuid; k numeric; n int; prefix text;
begin
  select * into c from change_orders where id = co for update;
  if not found then raise exception 'change order not found'; end if;
  if not is_manager(c.project_id) then raise exception 'only the owner or a manager can approve change orders'; end if;
  if c.status <> 'pending' then raise exception '% is already %', c.number, c.status; end if;
  select * into pr from projects where id = c.project_id for update;

  insert into baseline_revisions (project_id, rev, snapshot, note, created_by)
  values (pr.id, pr.baseline_rev, project_snapshot(pr.id), c.number || ' ' || c.title, auth.uid())
  on conflict (project_id, rev) do nothing;
  insert into project_finance (project_id, original_bac) values (pr.id, project_bac(pr.id))
  on conflict (project_id) do update set original_bac = coalesce(project_finance.original_bac, excluded.original_bac);

  prefix := replace(c.number, '-', '');
  for l in select * from change_order_lines where change_order_id = co order by sort, id loop
    if l.type = 'add' then
      select count(*) + 1 into n from boq_items where project_id = pr.id and ref like prefix || '.%';
      new_act := l.activity_id;
      if new_act is null then
        insert into activities (project_id, code, name_en, name_ar, trade_code, start_date, end_date)
        values (pr.id, 'co-' || prefix || '.' || n, coalesce(l.description, prefix), coalesce(l.description, prefix),
                coalesce(l.trade_code, 'G'), current_date, pr.end_date + c.extra_days)
        returning id into new_act;
      end if;
      insert into boq_items (project_id, ref, boq_code, trade_code, name_en, name_ar, unit, qty, rate, measure_mode, change_order_id, created_by)
      values (pr.id, prefix || '.' || n, prefix || '.' || n, coalesce(l.trade_code, 'G'), coalesce(l.description, ''), coalesce(l.description, ''),
              coalesce(l.unit, ''), coalesce(l.qty, 0), coalesce(l.rate, 0), 'qty', co, auth.uid())
      returning id into new_item;
      insert into item_stages (item_id, code, name_en, name_ar, weight, activity_id) values (new_item, 'all', 'All', 'الكل', 100, new_act);
      insert into allocations (item_id, area_id, qty)
      values (new_item, coalesce(l.area_id, (select id from areas where project_id = pr.id and code = 'GEN')), coalesce(l.qty, 0));
      update change_order_lines set item_id = new_item where id = l.id;
    else
      select * into it from boq_items where id = l.item_id and project_id = pr.id for update;
      if not found then raise exception 'BOQ line in % not found', c.number; end if;
      k := case when it.qty > 0 then (case when l.type = 'omit' then 0 else coalesce(l.qty, 0) end) / it.qty else 0 end;
      update allocations set qty = round(qty * k, 3) where item_id = it.id;
      update boq_items set qty = case when l.type = 'omit' then 0 else coalesce(l.qty, 0) end, change_order_id = co where id = it.id;
      update change_order_lines set old_qty = it.qty where id = l.id;
    end if;
  end loop;

  update projects set end_date = end_date + c.extra_days, baseline_rev = baseline_rev + 1 where id = pr.id;
  update change_orders set status = 'approved', revision = pr.baseline_rev + 1, decided_by = auth.uid(), decided_at = now() where id = co;
  return pr.baseline_rev + 1;
end $$;
revoke execute on function public.apply_change_order(uuid) from public, anon;
grant execute on function public.apply_change_order(uuid) to authenticated;
