-- Entire file, intended project admin SQL Editor only. NOT a migration.
-- DB role/claims simulation, not Storage HTTP. No binary writes.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

create temporary table file_test_context on commit drop as
select d.id as drawing_id, d.owner_id, d.scene_data,
  (select id from auth.users where id <> d.owner_id order by id limit 1) as foreign_id,
  gen_random_uuid() as foreign_drawing_id, f.id as metadata_id,
  f.mime_type, f.storage_path, 'TEST-rollback-' || gen_random_uuid()::text as probe_file_id,
  (select jsonb_agg(to_jsonb(x) order by x.id) from public.drawing_files x
    where x.drawing_id = d.id) as baseline
from public.drawings d join public.drawing_files f on f.drawing_id = d.id
where d.id = 'df912b92-80e3-46d8-8fd4-dd2160180cdd'::uuid
  and d.title = 'TEST 2026-10-04 backup-restore'
order by f.id limit 1;

do $$ begin
  if not exists (select 1 from file_test_context where foreign_id is not null) then
    raise exception 'TEST drawing/file and another existing user required';
  end if;
end $$;

-- A valid foreign parent makes WITH CHECK failure distinguishable from FK failure.
insert into public.drawings (id, owner_id, title, scene_data)
select foreign_drawing_id, foreign_id, 'TEST rollback-only file parent', scene_data
from file_test_context;

create temporary table file_test_results (check_name text, passed boolean) on commit drop;
grant select on file_test_context to authenticated;
grant select, insert on file_test_results to authenticated;
set local role authenticated;

do $$
declare
  ctx record;
  test record;
  actor uuid;
  affected bigint;
  denied boolean;
begin
  select * into strict ctx from file_test_context;
  insert into file_test_results values ('authenticated without bypass',
    current_user = 'authenticated' and not exists (
      select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)));
  insert into file_test_results values ('file CRUD grants present',
    has_table_privilege(current_user, 'public.drawing_files', 'SELECT')
    and has_table_privilege(current_user, 'public.drawing_files', 'INSERT')
    and has_table_privilege(current_user, 'public.drawing_files', 'UPDATE')
    and has_table_privilege(current_user, 'public.drawing_files', 'DELETE'));

  -- Fixed allowlist, parameterized values. Every mutation rolls back independently.
  for test in select * from (values
    ('owner file insert', 'insert into public.drawing_files (drawing_id,owner_id,file_id,mime_type,storage_path) values ($1,$2,$5,$6,$7)', 'one', false),
    ('owner file update', 'update public.drawing_files set mime_type=mime_type where id=$4', 'one', false),
    ('owner file delete', 'delete from public.drawing_files where id=$4', 'one', false),
    ('foreign file update', 'update public.drawing_files set mime_type=mime_type where id=$4', 'zero', true),
    ('foreign file delete', 'delete from public.drawing_files where id=$4', 'zero', true),
    ('foreign file owner spoof', 'insert into public.drawing_files (drawing_id,owner_id,file_id,mime_type,storage_path) values ($1,$2,$5,$6,$7)', 'denied', true),
    ('foreign file parent spoof', 'insert into public.drawing_files (drawing_id,owner_id,file_id,mime_type,storage_path) values ($1,$3,$5,$6,$7)', 'denied', true),
    ('owner file ownership transfer', 'update public.drawing_files set owner_id=$3 where id=$4', 'denied', false),
    ('owner file foreign parent transfer', 'update public.drawing_files set drawing_id=$8 where id=$4', 'denied', false),
    ('owner drawing ownership transfer', 'update public.drawings set owner_id=$3 where id=$1', 'denied', false)
  ) as tests(name, statement, expected, foreign_actor)
  loop
    actor := case when test.foreign_actor then ctx.foreign_id else ctx.owner_id end;
    perform set_config('request.jwt.claims', json_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    affected := null;
    denied := false;
    begin
      execute test.statement using ctx.drawing_id, ctx.owner_id, ctx.foreign_id,
        ctx.metadata_id, ctx.probe_file_id, ctx.mime_type, ctx.storage_path, ctx.foreign_drawing_id;
      get diagnostics affected = row_count;
      raise exception using errcode='ZX001', message='Rollback file test mutation';
    exception
      when insufficient_privilege then denied := true;
      when sqlstate 'ZX001' then null;
    end;
    insert into file_test_results values (test.name,
      case test.expected
        when 'one' then not denied and coalesce(affected=1,false)
        when 'zero' then not denied and coalesce(affected=0,false)
        when 'denied' then denied
      end);
  end loop;
end $$;
reset role;
insert into file_test_results
select 'original file metadata unchanged', baseline =
  (select jsonb_agg(to_jsonb(x) order by x.id) from public.drawing_files x
    where x.drawing_id=c.drawing_id)
from file_test_context c;
select check_name, passed from file_test_results order by check_name;
rollback;
