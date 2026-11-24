-- Photo storage (docs/05, docs/06 #7): private bucket 'photos', path {project_id}/{entry_or_proposal_id}/{n}.jpg
-- (thumbnails: {project_id}/{id}/{n}-thumb.jpg). Free tier: owner archives and frees space from the app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create function public.photo_project(name text) returns uuid
  language sql immutable as $$
  select case when split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(name, '/', 1)::uuid end
$$;

create policy "photos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member(public.photo_project(name)));
create policy "photos: recorders upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_record(public.photo_project(name)));
create policy "photos: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_manager(public.photo_project(name)));
