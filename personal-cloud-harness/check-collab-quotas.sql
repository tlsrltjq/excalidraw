-- Disposable local fixture only. All changes below roll back.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
create function pg_temp.assert_fails(command text, label text, expected_state text default '54000') returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate <> expected_state then raise exception 'FAIL: %, unexpected SQLSTATE %', label, sqlstate; end if;
    raise notice 'PASS: %', label; return; end;
  raise exception 'FAIL: %', label;
end $$;

select pg_temp.assert_true(not has_table_privilege('anon','public.collab_usage','select'), 'anon cannot read usage');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.collab_file_reservations','insert'), 'owner cannot reserve directly');
select pg_temp.assert_true(not has_table_privilege('service_role','public.collab_request_budgets','update'), 'service cannot reset counters directly');
select pg_temp.assert_true(not has_function_privilege('anon','public.collab_consume_edge_budget(text)','execute'), 'anon cannot consume or reset global quota');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.collab_reserve_file(text,uuid,text,text)','execute'), 'owner cannot call reserve RPC');
select pg_temp.assert_true(not has_function_privilege('service_role','public.collab_take_budget(text)','execute'), 'service cannot consume arbitrary budget');
select pg_temp.assert_true(has_function_privilege('service_role','public.collab_reserve_file(text,uuid,text,text)','execute'), 'service can call reserve RPC');
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in ('public.collab_usage'::regclass,'public.collab_file_reservations'::regclass,'public.collab_request_budgets'::regclass)), 'all private tables have RLS');

insert into auth.users(id) values ('00000000-0000-4000-8000-000000000022');
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000022';
set role authenticated;
select public.collab_create_room('sc_bbbbbbbbbbbbbbbbbbbb');
select public.collab_issue_invite('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',encode(sha256(convert_to(repeat('1',64),'UTF8')),'hex'),'write',now()+interval '1 day');
select public.collab_issue_invite('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000003',encode(sha256(convert_to(repeat('2',64),'UTF8')),'hex'),'read',now()+interval '1 day');
reset role;
select pg_temp.assert_true((select rooms = 1 and invites = 2 from public.collab_usage), 'metadata usage accounted');
update public.collab_usage set rooms=256;
select pg_temp.assert_fails($q$select public.collab_create_room('sc_cccccccccccccccccccc')$q$, 'room cap rejects creation', '23514');
update public.collab_usage set rooms=1,invites=4096;
select pg_temp.assert_fails($q$select public.collab_issue_invite('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000004',repeat('0',64),'write',now()+interval '1 day')$q$, 'invite cap rejects creation', '23514');
update public.collab_usage set invites=2;
set role service_role;
select pg_temp.assert_true(public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64),'TEST-file'), 'first reservation');
select pg_temp.assert_true(public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64),'TEST-file'), 'same path retry');
select pg_temp.assert_fails($q$select public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000003',repeat('2',64),'TEST-read')$q$, 'read grant cannot reserve', '42501');
select pg_temp.assert_fails($q$select public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('3',64),'TEST-bad')$q$, 'wrong proof cannot reserve', '42501');
select pg_temp.assert_fails($q$select public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64),'../bad')$q$, 'path traversal rejected', '22023');
reset role;
select pg_temp.assert_true((select file_slots = 1 from public.collab_usage), 'retry charges only one slot');
set role service_role;
select pg_temp.assert_fails($q$insert into storage.objects(bucket_id,name) values('collab-files','sc_bbbbbbbbbbbbbbbbbbbb/TEST-missing')$q$, 'unreserved object insert blocked');
insert into storage.objects(bucket_id,name) values('collab-files','sc_bbbbbbbbbbbbbbbbbbbb/TEST-file');
select pg_temp.assert_fails($q$update storage.objects set name='sc_bbbbbbbbbbbbbbbbbbbb/TEST-missing'$q$, 'unreserved rename blocked');
reset role;
update public.collab_usage set file_slots=64;
set role service_role;
select pg_temp.assert_true(not public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64),'TEST-full'), 'full quota rejects new file');
select pg_temp.assert_true(public.collab_reserve_file('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64),'TEST-file'), 'full quota allows reserved path retry');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.collab_file_reservations where path like '%TEST-full'), 'failed quota leaves no ledger row');
update public.collab_usage set file_slots=1;
insert into public.collab_scenes values('sc_bbbbbbbbbbbbbbbbbbbb',decode(repeat('00',16),'hex'),decode(repeat('00',12),'hex'),1,0);
select pg_temp.assert_true((select scene_bytes=16 from public.collab_usage), 'scene insert bytes');
update public.collab_scenes set ciphertext=decode(repeat('00',32),'hex');
select pg_temp.assert_true((select scene_bytes=32 from public.collab_usage), 'scene replacement delta');
update public.collab_usage set scene_bytes=33554432;
select pg_temp.assert_fails($q$update public.collab_scenes set ciphertext=decode(repeat('00',33),'hex')$q$, 'scene growth beyond limit rejected', '23514');
select pg_temp.assert_true((select octet_length(ciphertext)=32 from public.collab_scenes), 'quota failure preserves old scene');
update public.collab_usage set scene_bytes=32;
update public.collab_request_budgets set window_start=date_trunc('minute',clock_timestamp()) + interval '1 minute',used=max_requests where kind in ('files','checks','reads','writes');
set role service_role;
select pg_temp.assert_true(not public.collab_consume_edge_budget('files'), 'exhausted shared Edge budget');
select pg_temp.assert_true(not public.collab_consume_edge_budget('unknown'), 'unknown budget fails closed');
reset role;
select pg_temp.assert_fails($q$select public.collab_check_invite('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64))$q$, 'direct proof RPC quota');
select pg_temp.assert_fails($q$select public.collab_read_scene('sc_bbbbbbbbbbbbbbbbbbbb','00000000-0000-4000-8000-000000000002',repeat('1',64))$q$, 'direct read RPC quota');
select pg_temp.assert_fails($q$update public.collab_scenes set revision=revision+1$q$, 'direct write trigger quota');
update public.collab_request_budgets set window_start=clock_timestamp()-interval '2 minutes' where kind='files';
set role service_role;
select pg_temp.assert_true(public.collab_consume_edge_budget('files'), 'window recovery');
reset role;
delete from public.collab_rooms where id='sc_bbbbbbbbbbbbbbbbbbbb';
select pg_temp.assert_true((select scene_bytes=0 and rooms=0 and invites=0 and file_slots=1 from public.collab_usage), 'cascade adjusts usage but retains file reservation');
rollback;
