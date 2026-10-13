-- Synthetic fixtures only. All room/scene/user changes are rolled back.
begin;
create function pg_temp.assert(ok boolean, label text) returns text
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;
create function pg_temp.denied(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when insufficient_privilege then return true;
end;
$$;
create function pg_temp.invalid(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when invalid_parameter_value then return true;
end;
$$;
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000011'), ('00000000-0000-4000-8000-000000000012');
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select pg_temp.assert(pg_temp.denied('select * from public.collab_scenes'), 'anon direct scene blocked');
select pg_temp.assert(pg_temp.denied('select * from public.collab_invites'), 'anon invite hashes blocked');
select pg_temp.assert(pg_temp.denied($q$select public.collab_create_room('sc_aaaaaaaaaaaaaaaaaaaa')$q$), 'anon create blocked');
select pg_temp.assert(pg_temp.denied($q$select public.collab_authorize('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001', repeat('0',64))$q$), 'internal helper blocked');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', true);
set local role authenticated;
select public.collab_create_room('sc_aaaaaaaaaaaaaaaaaaaa');
select public.collab_create_room('sc_bbbbbbbbbbbbbbbbbbbb');
select public.collab_issue_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001', encode(sha256(convert_to(repeat('0',64),'UTF8')),'hex'), 'write', now()+interval '1 day');
select public.collab_issue_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000002', encode(sha256(convert_to(repeat('1',64),'UTF8')),'hex'), 'read', now()+interval '1 day');
select pg_temp.assert((select count(*) = 2 from public.collab_rooms), 'owner room visibility');
select pg_temp.assert(pg_temp.denied('select * from public.collab_scenes'), 'owner direct scene blocked');
select pg_temp.assert(pg_temp.denied($q$insert into public.collab_rooms(id) values ('sc_cccccccccccccccccccc')$q$), 'direct room creation blocked');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000012', true);
set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.collab_rooms), 'other account RLS room isolation');
select pg_temp.assert((select count(*) = 0 from public.collab_invites), 'other account RLS invite isolation');
select pg_temp.assert(pg_temp.denied($q$select public.collab_issue_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000003', repeat('a',64), 'write', now()+interval '1 day')$q$), 'other account issue blocked');
select pg_temp.assert(pg_temp.denied($q$select public.collab_revoke_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001')$q$), 'other account revoke blocked');
select pg_temp.assert(pg_temp.denied($q$select public.collab_check_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001', repeat('f',64))$q$), 'login without valid proof blocked');
select pg_temp.assert(public.collab_check_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001',repeat('0',64)) = 'write', 'invited other account allowed');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select pg_temp.assert(public.collab_read_scene('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001',repeat('0',64)) is null, 'invited guest empty scene');
select pg_temp.assert(public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),null,encode(decode(repeat('00',16),'hex'),'base64'),encode(decode(repeat('00',12),'hex'),'base64'),0) = '{"status":"saved","revision":1}'::jsonb, 'guest initial CAS revision one');
select pg_temp.assert(public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),null,encode(decode(repeat('00',16),'hex'),'base64'),encode(decode(repeat('00',12),'hex'),'base64'),0) = '{"status":"conflict"}'::jsonb, 'duplicate creation conflicts');
select pg_temp.assert(public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),1,encode(decode(repeat('00',16),'hex'),'base64'),encode(decode(repeat('00',12),'hex'),'base64'),1) = '{"status":"saved","revision":2}'::jsonb, 'CAS increments revision');
select pg_temp.assert(public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),1,encode(decode(repeat('00',16),'hex'),'base64'),encode(decode(repeat('00',12),'hex'),'base64'),2) = '{"status":"conflict"}'::jsonb, 'stale CAS cannot overwrite');
select pg_temp.assert(public.collab_read_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000002',repeat('1',64))->>'revision' = '2', 'read-only invitation reads');
select pg_temp.assert(pg_temp.invalid($q$select public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),0,'AAAAAAAAAAAAAAAAAAAAAA==','AAAAAAAAAAAAAAAA',0)$q$), 'invalid revision blocked');
select pg_temp.assert(pg_temp.invalid($q$select public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),2,'AAAAAAAAAAAAAAAAAAAAAA==','AA==',0)$q$), 'invalid IV blocked');
select pg_temp.assert(pg_temp.invalid($q$select public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),2,repeat('A',2832998),'AAAAAAAAAAAAAAAA',0)$q$), 'oversized ciphertext blocked');
select pg_temp.assert(pg_temp.denied($q$select public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000002',repeat('1',64),2,'AAAAAAAAAAAAAAAAAAAAAA==','AAAAAAAAAAAAAAAA',0)$q$), 'read-only invitation cannot write');
select pg_temp.assert(pg_temp.denied($q$select public.collab_read_scene('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000001',repeat('0',64))$q$), 'cross-room invitation blocked');
select pg_temp.assert(pg_temp.denied($q$select public.collab_read_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',null)$q$), 'missing proof blocked');
reset role;
update public.collab_invites set expires_at = now()-interval '1 second' where id='00000000-0000-4000-8000-000000000002';
set local role anon;
select pg_temp.assert(pg_temp.denied($q$select public.collab_read_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000002',repeat('1',64))$q$), 'expired invitation blocked');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', true);
set local role authenticated;
select public.collab_revoke_invite('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select pg_temp.assert(pg_temp.denied($q$select public.collab_read_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64))$q$), 'revoked invitation blocked');
reset role;
update public.collab_invites set revoked_at=null where id='00000000-0000-4000-8000-000000000001';
update public.collab_rooms set disabled=true where id='sc_aaaaaaaaaaaaaaaaaaaa';
set local role anon;
select pg_temp.assert(pg_temp.denied($q$select public.collab_read_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64))$q$), 'disabled room blocked');
reset role;
rollback;
