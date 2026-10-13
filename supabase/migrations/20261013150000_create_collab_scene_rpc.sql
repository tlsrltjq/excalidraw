begin;

create table public.collab_rooms (
  id text primary key check (id ~ '^sc_[a-f0-9]{20}$'),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
create index collab_rooms_owner_idx on public.collab_rooms(owner_id);
alter table public.collab_rooms enable row level security;
create policy collab_rooms_select_own on public.collab_rooms for select to authenticated
  using (owner_id = auth.uid());
create policy collab_rooms_disable_own on public.collab_rooms for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.collab_invites (
  id uuid primary key,
  room_id text not null references public.collab_rooms(id) on delete cascade,
  proof_hash text not null check (proof_hash ~ '^[a-f0-9]{64}$'),
  scope text not null check (scope in ('read', 'write')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index collab_invites_room_idx on public.collab_invites(room_id);
alter table public.collab_invites enable row level security;
create policy collab_invites_select_own on public.collab_invites for select to authenticated
  using (exists (select 1 from public.collab_rooms r where r.id = room_id and r.owner_id = auth.uid()));

create table public.collab_scenes (
  room_id text primary key references public.collab_rooms(id) on delete cascade,
  ciphertext bytea not null check (octet_length(ciphertext) between 16 and 2097152),
  iv bytea not null check (octet_length(iv) = 12),
  revision bigint not null check (revision between 1 and 9007199254740991),
  scene_version bigint not null check (scene_version between 0 and 9007199254740991)
);
alter table public.collab_scenes enable row level security;
-- No scene policies: even owners must submit an invitation to the RPC.
revoke all on public.collab_rooms, public.collab_invites, public.collab_scenes from public, anon, authenticated;
grant select on public.collab_rooms, public.collab_invites to authenticated;
grant update (disabled) on public.collab_rooms to authenticated;

create function public.collab_create_room(p_room_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  insert into public.collab_rooms(id, owner_id) values (p_room_id, auth.uid());
end;
$$;

create function public.collab_issue_invite(
  p_room_id text, p_invite_id uuid, p_proof_hash text, p_scope text, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.collab_rooms r
    where r.id = p_room_id and r.owner_id = auth.uid() and not r.disabled for update;
  if not found then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  if p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'Invalid collaboration expiry' using errcode = '22023';
  end if;
  insert into public.collab_invites(id, room_id, proof_hash, scope, expires_at)
    values (p_invite_id, p_room_id, p_proof_hash, p_scope, p_expires_at);
end;
$$;

create function public.collab_revoke_invite(p_room_id text, p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.collab_rooms r
    where r.id = p_room_id and r.owner_id = auth.uid() for update;
  if not found then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  update public.collab_invites set revoked_at = clock_timestamp()
    where room_id = p_room_id and id = p_invite_id;
end;
$$;

-- This helper is callable only by function owners, not API roles.
create function public.collab_authorize(p_room_id text, p_invite_id uuid, p_proof text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  invitation public.collab_invites%rowtype;
begin
  if p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  perform 1 from public.collab_rooms r where r.id = p_room_id and not r.disabled for share;
  if not found then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  select i.* into invitation from public.collab_invites i
    where i.id = p_invite_id and i.room_id = p_room_id for share;
  if not found or invitation.revoked_at is not null or invitation.expires_at <= clock_timestamp()
    or invitation.proof_hash <> encode(sha256(convert_to(p_proof, 'UTF8')), 'hex') then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  return invitation.scope;
end;
$$;

create function public.collab_check_invite(p_room_id text, p_invite_id uuid, p_proof text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  return public.collab_authorize(p_room_id, p_invite_id, p_proof);
end;
$$;

create function public.collab_read_scene(p_room_id text, p_invite_id uuid, p_proof text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform public.collab_authorize(p_room_id, p_invite_id, p_proof);
  select jsonb_build_object('ciphertext', encode(s.ciphertext, 'base64'),
    'iv', encode(s.iv, 'base64'), 'revision', s.revision, 'sceneVersion', s.scene_version)
    into result from public.collab_scenes s where s.room_id = p_room_id;
  return result;
end;
$$;

create function public.collab_cas_scene(
  p_room_id text, p_invite_id uuid, p_proof text, p_expected_revision bigint,
  p_ciphertext text, p_iv text, p_scene_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  new_revision bigint;
  encrypted bytea;
  nonce bytea;
begin
  if public.collab_authorize(p_room_id, p_invite_id, p_proof) <> 'write' then
    raise exception 'Collaboration access denied' using errcode = '42501';
  end if;
  if p_ciphertext is null or octet_length(p_ciphertext) > 2832997 or p_iv is null
    or octet_length(p_iv) > 24 or p_scene_version is null
    or p_scene_version not between 0 and 9007199254740991
    or (p_expected_revision is not null and p_expected_revision not between 1 and 9007199254740990) then
    raise exception 'Invalid encrypted collaboration scene' using errcode = '22023';
  end if;
  begin
    encrypted := decode(p_ciphertext, 'base64');
    nonce := decode(p_iv, 'base64');
  exception when others then
    raise exception 'Invalid encrypted collaboration scene' using errcode = '22023';
  end;
  if octet_length(encrypted) not between 16 and 2097152 or octet_length(nonce) <> 12 then
    raise exception 'Invalid encrypted collaboration scene' using errcode = '22023';
  end if;
  if p_expected_revision is null then
    insert into public.collab_scenes(room_id, ciphertext, iv, revision, scene_version)
      values(p_room_id, encrypted, nonce, 1, p_scene_version)
      on conflict (room_id) do nothing returning revision into new_revision;
  else
    update public.collab_scenes set ciphertext = encrypted, iv = nonce,
      revision = revision + 1, scene_version = p_scene_version
      where room_id = p_room_id and revision = p_expected_revision returning revision into new_revision;
  end if;
  if new_revision is null then
    return jsonb_build_object('status', 'conflict');
  end if;
  return jsonb_build_object('status', 'saved', 'revision', new_revision);
end;
$$;

revoke all on function public.collab_create_room(text),
  public.collab_issue_invite(text, uuid, text, text, timestamptz),
  public.collab_revoke_invite(text, uuid), public.collab_authorize(text, uuid, text),
  public.collab_check_invite(text, uuid, text), public.collab_read_scene(text, uuid, text),
  public.collab_cas_scene(text, uuid, text, bigint, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.collab_create_room(text),
  public.collab_issue_invite(text, uuid, text, text, timestamptz),
  public.collab_revoke_invite(text, uuid) to authenticated;
grant execute on function public.collab_check_invite(text, uuid, text),
  public.collab_read_scene(text, uuid, text),
  public.collab_cas_scene(text, uuid, text, bigint, text, text, bigint) to anon, authenticated;

commit;
