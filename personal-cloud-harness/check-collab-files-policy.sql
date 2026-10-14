begin;
create function pg_temp.file_assert(ok boolean, label text) returns text language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;
create function pg_temp.file_denied(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when insufficient_privilege then return true;
end;
$$;
select pg_temp.file_assert((select not public and file_size_limit=4194304
  and allowed_mime_types=array['application/octet-stream'] from storage.buckets where id='collab-files'), 'private bucket bounds');
insert into storage.buckets(id,name,public) values('TEST-other-bucket','TEST-other-bucket',false);
insert into storage.objects(bucket_id,name) values
  ('collab-files','sc_aaaaaaaaaaaaaaaaaaaa/TEST-file'),('TEST-other-bucket','TEST-file');
set local role anon;
select pg_temp.file_assert((select count(*)=0 from storage.objects where bucket_id='collab-files'), 'anon private read blocked despite broad policy');
select pg_temp.file_assert(pg_temp.file_denied($q$insert into storage.objects(bucket_id,name) values('collab-files','sc_aaaaaaaaaaaaaaaaaaaa/TEST-new')$q$), 'anon upload blocked');
with changes as (update storage.objects set name='TEST-overwrite' where bucket_id='collab-files' returning id)
  select pg_temp.file_assert((select count(*)=0 from changes), 'anon overwrite blocked');
with changes as (delete from storage.objects where bucket_id='collab-files' returning id)
  select pg_temp.file_assert((select count(*)=0 from changes), 'anon delete blocked');
reset role;
set local role authenticated;
select pg_temp.file_assert((select count(*)=0 from storage.objects where bucket_id='collab-files'), 'account private read blocked');
select pg_temp.file_assert(pg_temp.file_denied($q$insert into storage.objects(bucket_id,name) values('collab-files','sc_aaaaaaaaaaaaaaaaaaaa/TEST-new')$q$), 'account upload blocked');
with changes as (update storage.objects set name='TEST-overwrite' where bucket_id='collab-files' returning id)
  select pg_temp.file_assert((select count(*)=0 from changes), 'account overwrite blocked');
with changes as (delete from storage.objects where bucket_id='collab-files' returning id)
  select pg_temp.file_assert((select count(*)=0 from changes), 'account delete blocked');
select pg_temp.file_assert((select count(*)=1 from storage.objects where bucket_id='TEST-other-bucket'), 'other bucket policy unaffected');
reset role;
select pg_temp.file_assert((select count(*)=1 from storage.objects where bucket_id='collab-files' and name='sc_aaaaaaaaaaaaaaaaaaaa/TEST-file'), 'original fixture metadata unchanged');
rollback;
