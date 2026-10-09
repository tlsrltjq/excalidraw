create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index folders_owner_idx on public.folders(owner_id);
alter table public.folders enable row level security;
create policy folders_select_own on public.folders for select to authenticated using (owner_id = auth.uid());
create policy folders_insert_own on public.folders for insert to authenticated with check (owner_id = auth.uid());
create policy folders_update_own on public.folders for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy folders_delete_own on public.folders for delete to authenticated using (owner_id = auth.uid());

-- Deleting a folder removes only its classification, never the drawing.
create table public.drawing_folders (
  drawing_id uuid primary key references public.drawings(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade
);
create index drawing_folders_folder_idx on public.drawing_folders(folder_id);
alter table public.drawing_folders enable row level security;
create policy drawing_folders_select_own on public.drawing_folders for select to authenticated using (
  exists(select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid())
  and exists(select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid())
);
create policy drawing_folders_insert_own on public.drawing_folders for insert to authenticated with check (
  exists(select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid())
  and exists(select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid())
);
create policy drawing_folders_update_own on public.drawing_folders for update to authenticated using (
  exists(select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid())
  and exists(select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid())
) with check (
  exists(select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid())
  and exists(select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid())
);
create policy drawing_folders_delete_own on public.drawing_folders for delete to authenticated using (
  exists(select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid())
  and exists(select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid())
);
revoke all on public.folders, public.drawing_folders from anon;
grant select, insert, update, delete on public.folders, public.drawing_folders to authenticated;
