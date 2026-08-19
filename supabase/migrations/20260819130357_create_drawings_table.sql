-- Milestone 3: Cloud Workspace — drawings table
--
-- Stores one row per Cloud drawing. `scene_data` holds the exact JSON shape
-- produced by `serializeAsJSON(elements, appState, files, "database")` on
-- the client (see personal-cloud-docs/ENGINEERING_GUARDRAILS.md #2) — binary
-- files are stored separately (Milestone 5), never inline here.
--
-- `revision` is not yet used for conditional updates (that lands in
-- Milestone 4's autosave coordinator); it is created now so no further
-- schema migration is needed when autosave arrives.

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled',
  scene_data jsonb not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.drawings is
  'One row per Cloud drawing. scene_data is the database-serialized Excalidraw scene (no binary files).';

alter table public.drawings enable row level security;

-- Each policy is scoped to auth.uid() = owner_id so a user can only ever
-- see/create/change/delete their own drawings. The client never supplies
-- owner_id directly (see ENGINEERING_GUARDRAILS.md #12) — the column
-- default handles that on insert, and the WITH CHECK below rejects any
-- insert/update that tries to claim a different owner_id.

create policy "drawings_select_own"
  on public.drawings for select
  using (auth.uid() = owner_id);

create policy "drawings_insert_own"
  on public.drawings for insert
  with check (auth.uid() = owner_id);

create policy "drawings_update_own"
  on public.drawings for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "drawings_delete_own"
  on public.drawings for delete
  using (auth.uid() = owner_id);

create index if not exists drawings_owner_id_idx on public.drawings (owner_id);
create index if not exists drawings_owner_updated_at_idx on public.drawings (owner_id, updated_at desc);

-- Keep updated_at fresh on every UPDATE (title rename, future scene saves).
create or replace function public.drawings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drawings_set_updated_at on public.drawings;
create trigger drawings_set_updated_at
  before update on public.drawings
  for each row
  execute function public.drawings_set_updated_at();
