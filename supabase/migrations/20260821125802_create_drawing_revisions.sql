-- Milestone 6: minimal version history (DECISIONS.md D-012)
--
-- Snapshot-based, not an operation log. A BEFORE UPDATE trigger on
-- `drawings` captures the state that's about to be overwritten whenever
-- scene_data actually changes, and keeps only the most recent 50 rows per
-- drawing (rolling window, no named/pinned versions in this minimal
-- version). Because it's a trigger, this fires no matter which code path
-- updates the row (autosave, conflict-resolution overwrite, a future
-- restore) — no client code has to remember to "also snapshot".

create table if not exists public.drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  revision bigint not null,
  scene_data jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.drawing_revisions is
  'Snapshots of drawings.scene_data taken right before each overwrite (see drawings_snapshot_revision trigger). Rolling window of the most recent 50 per drawing_id.';

alter table public.drawing_revisions enable row level security;

-- Read-only from the client's perspective: only a SELECT policy exists,
-- and only SELECT is GRANTed below. Writes happen exclusively through the
-- SECURITY DEFINER trigger function, so a user can never insert a forged
-- "past" revision or delete their own history to hide something.
create policy "drawing_revisions_select_own"
  on public.drawing_revisions for select
  using (auth.uid() = owner_id);

create index if not exists drawing_revisions_drawing_id_created_at_idx
  on public.drawing_revisions (drawing_id, created_at desc);

grant usage on schema public to authenticated;
grant select on public.drawing_revisions to authenticated;

-- `search_path` is pinned per Postgres's own SECURITY DEFINER hardening
-- guidance, so this function can't be tricked by a caller-controlled
-- search_path into resolving `public.*` names to something else.
create or replace function public.drawings_snapshot_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.scene_data is distinct from old.scene_data then
    insert into public.drawing_revisions (drawing_id, owner_id, revision, scene_data, created_at)
    values (old.id, old.owner_id, old.revision, old.scene_data, now());

    delete from public.drawing_revisions
    where drawing_id = old.id
      and id not in (
        select id from public.drawing_revisions
        where drawing_id = old.id
        order by created_at desc
        limit 50
      );
  end if;
  return new;
end;
$$;

drop trigger if exists drawings_snapshot_before_update on public.drawings;
create trigger drawings_snapshot_before_update
  before update on public.drawings
  for each row
  execute function public.drawings_snapshot_revision();
