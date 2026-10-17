begin;

-- A ledger cannot safely be inferred for already stored encrypted objects.
lock table public.collab_rooms, public.collab_invites, public.collab_scenes in share row exclusive mode;
lock table storage.objects in share row exclusive mode;
do $$ begin
  if not exists (select 1 from storage.buckets where id='collab-files'
    and not public and file_size_limit between 1 and 4194304) then
    raise exception 'Private collaboration bucket with 4 MiB maximum required';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'collab-files') then
    raise exception 'Collaboration files require quota backfill before migration';
  end if;
end $$;

create table public.collab_usage (
  id boolean primary key default true check (id),
  scene_bytes bigint not null check (scene_bytes between 0 and 33554432),
  file_slots integer not null default 0 check (file_slots between 0 and 64),
  rooms integer not null check (rooms between 0 and 256),
  invites integer not null check (invites between 0 and 4096)
);
insert into public.collab_usage(id, scene_bytes, rooms, invites)
  select true, (select coalesce(sum(octet_length(ciphertext)),0) from public.collab_scenes),
    (select count(*) from public.collab_rooms), (select count(*) from public.collab_invites);

create table public.collab_file_reservations (
  path text primary key check (path ~ '^sc_[a-f0-9]{20}/[A-Za-z0-9_-]{1,128}$')
);
-- No room FK: deleting a room must not free slots for retained Storage bytes.
create table public.collab_request_budgets (
  kind text primary key,
  window_start timestamptz not null default '-infinity',
  used integer not null default 0 check (used >= 0),
  max_requests integer not null check (max_requests > 0)
);
insert into public.collab_request_budgets(kind, max_requests) values
  ('files',120), ('tickets',240), ('checks',600), ('reads',120), ('writes',120);

alter table public.collab_usage enable row level security;
alter table public.collab_file_reservations enable row level security;
alter table public.collab_request_budgets enable row level security;
-- Deliberately no client policies: only security-definer functions access these.
revoke all on public.collab_usage, public.collab_file_reservations,
  public.collab_request_budgets from public, anon, authenticated, service_role;

create function public.collab_take_budget(p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_window timestamptz := date_trunc('minute', clock_timestamp());
begin
  update public.collab_request_budgets
    set used = case when window_start < v_window then 1 else used + 1 end,
      window_start = greatest(window_start, v_window)
    where kind = p_kind and (window_start < v_window or used < max_requests);
  return found;
end;
$$;

create function public.collab_consume_edge_budget(p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('files','tickets') or p_kind is null then
    return false;
  end if;
  return public.collab_take_budget(p_kind);
end;
$$;

create function public.collab_reserve_file(
  p_room_id text, p_invite_id uuid, p_proof text, p_file_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if public.collab_authorize(p_room_id,p_invite_id,p_proof) <> 'write' then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  if p_file_id is null or p_file_id !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'Invalid collaboration file' using errcode = '22023';
  end if;
  v_path := p_room_id || '/' || p_file_id;
  perform 1 from public.collab_usage where id for update;
  if not found then raise exception 'Collaboration quota unavailable'; end if;
  if exists (select 1 from public.collab_file_reservations where path = v_path) then
    return true;
  end if;
  update public.collab_usage set file_slots = file_slots + 1 where id and file_slots < 64;
  if not found then return false; end if;
  insert into public.collab_file_reservations(path) values(v_path);
  return true;
end;
$$;

create function public.collab_enforce_file_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bucket_id = 'collab-files' and not exists
    (select 1 from public.collab_file_reservations where path = new.name) then
    raise exception 'Collaboration file quota reservation required' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger collab_file_reservation before insert or update on storage.objects
  for each row execute function public.collab_enforce_file_reservation();

create function public.collab_account_usage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare delta bigint;
begin
  if tg_table_name = 'collab_scenes' then
    delta := case when tg_op = 'DELETE' then 0 else octet_length(new.ciphertext) end
      - case when tg_op = 'INSERT' then 0 else octet_length(old.ciphertext) end;
    if tg_op <> 'DELETE' and not public.collab_take_budget('writes') then
      raise exception 'Collaboration request quota exceeded' using errcode = '54000';
    end if;
    update public.collab_usage set scene_bytes = scene_bytes + delta where id;
  elsif tg_table_name = 'collab_rooms' then
    update public.collab_usage set rooms = rooms + case when tg_op = 'INSERT' then 1 else -1 end where id;
  else
    update public.collab_usage set invites = invites + case when tg_op = 'INSERT' then 1 else -1 end where id;
  end if;
  if not found then raise exception 'Collaboration quota unavailable'; end if;
  return null;
end;
$$;
create trigger collab_scene_usage after insert or update or delete on public.collab_scenes
  for each row execute function public.collab_account_usage();
create trigger collab_room_usage after insert or delete on public.collab_rooms
  for each row execute function public.collab_account_usage();
create trigger collab_invite_usage after insert or delete on public.collab_invites
  for each row execute function public.collab_account_usage();

create or replace function public.collab_check_invite(p_room_id text, p_invite_id uuid, p_proof text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_scope text;
begin
  v_scope := public.collab_authorize(p_room_id,p_invite_id,p_proof);
  if not public.collab_take_budget('checks') then
    raise exception 'Collaboration request quota exceeded' using errcode = '54000';
  end if;
  return v_scope;
end;
$$;

create or replace function public.collab_read_scene(p_room_id text, p_invite_id uuid, p_proof text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.collab_authorize(p_room_id,p_invite_id,p_proof);
  if not public.collab_take_budget('reads') then
    raise exception 'Collaboration request quota exceeded' using errcode = '54000';
  end if;
  select jsonb_build_object('ciphertext', encode(s.ciphertext,'base64'),
    'iv', encode(s.iv,'base64'), 'revision',s.revision,'sceneVersion',s.scene_version)
    into result from public.collab_scenes s where s.room_id = p_room_id;
  return result;
end;
$$;

revoke all on function public.collab_take_budget(text), public.collab_consume_edge_budget(text),
  public.collab_reserve_file(text,uuid,text,text), public.collab_enforce_file_reservation(),
  public.collab_account_usage() from public, anon, authenticated, service_role;
grant execute on function public.collab_consume_edge_budget(text),
  public.collab_reserve_file(text,uuid,text,text) to service_role;
commit;
