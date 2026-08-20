-- Milestone 5: Images and files (DECISIONS.md D-011)
--
-- Adds:
--   1. a private Storage bucket ("drawing-files") for the actual binary
--      bytes, path convention <owner_id>/<drawing_id>/<file_id>
--   2. a public.drawing_files metadata table (mime type, which drawing a
--      file belongs to) — Storage objects alone can't be queried
--      relationally, so this is what `getFiles`/orphan cleanup will use
--
-- Same explicit-GRANT requirement as drawings (see
-- 20260819140000_grant_drawings_table.sql): this project has
-- "Automatically expose new tables" turned off, so `authenticated` needs an
-- explicit GRANT on drawing_files before RLS is even evaluated. This does
-- NOT apply to storage.objects/storage.buckets — those are part of the
-- Storage extension's own pre-existing schema and already carry the base
-- grants the Storage API needs; only their RLS policies are project-specific.

create table if not exists public.drawing_files (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings (id) on delete cascade,
  file_id text not null,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mime_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (drawing_id, file_id)
);

comment on table public.drawing_files is
  'Metadata for binary files stored in the drawing-files Storage bucket (see storage_path). Row per (drawing_id, file_id).';

alter table public.drawing_files enable row level security;

-- Mirrors ENGINEERING_GUARDRAILS.md #12: don't trust owner_id alone on a
-- child row — also verify the parent drawing is actually owned by the same
-- user, so a file row can't be attached to someone else's drawing_id.
create policy "drawing_files_select_own"
  on public.drawing_files for select
  using (auth.uid() = owner_id);

create policy "drawing_files_insert_own"
  on public.drawing_files for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.drawings d
      where d.id = drawing_id and d.owner_id = auth.uid()
    )
  );

create policy "drawing_files_update_own"
  on public.drawing_files for update
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.drawings d
      where d.id = drawing_id and d.owner_id = auth.uid()
    )
  );

create policy "drawing_files_delete_own"
  on public.drawing_files for delete
  using (auth.uid() = owner_id);

create index if not exists drawing_files_drawing_id_idx on public.drawing_files (drawing_id);
create index if not exists drawing_files_owner_id_idx on public.drawing_files (owner_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.drawing_files to authenticated;

-- Private bucket for the actual file bytes. `public = false` means every
-- read also goes through the RLS policies below (no direct public URL).
insert into storage.buckets (id, name, public)
values ('drawing-files', 'drawing-files', false)
on conflict (id) do nothing;

-- Path convention (D-011): <owner_id>/<drawing_id>/<file_id>.
-- storage.foldername(name) splits the object path into folder segments;
-- [1] is the first segment, i.e. the owner_id the uploader claims.
create policy "drawing_files_storage_select_own"
  on storage.objects for select
  using (
    bucket_id = 'drawing-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "drawing_files_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'drawing-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "drawing_files_storage_update_own"
  on storage.objects for update
  using (
    bucket_id = 'drawing-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'drawing-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "drawing_files_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'drawing-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
