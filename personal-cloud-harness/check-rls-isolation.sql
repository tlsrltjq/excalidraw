-- Run the WHOLE file in the intended project's admin SQL editor.
-- Not a migration. No credentials, scene output, or persistent changes.
-- Simulated DB claims test RLS, NOT real JWT authentication / Storage HTTP.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

create temporary table rls_test_context on commit drop as
select id, owner_id, scene_data, gen_random_uuid() as foreign_id
from public.drawings
where id = 'df912b92-80e3-46d8-8fd4-dd2160180cdd'::uuid
  and title = 'TEST 2026-10-04 backup-restore';
create temporary table rls_test_results (
  check_name text, passed boolean
) on commit drop;
grant select on rls_test_context to authenticated;
grant select, insert on rls_test_results to authenticated;

do $$
begin
  if (select count(*) from rls_test_context) <> 1 then
    raise exception 'Required TEST drawing not found; stop, do not substitute a real drawing';
  end if;
end $$;

set local role authenticated;
do $$
declare
  ctx record;
  affected bigint;
  write_denied boolean;
begin
  select * into strict ctx from rls_test_context;
  perform set_config('request.jwt.claims',
    json_build_object('sub', ctx.owner_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ctx.owner_id::text, true);
  insert into rls_test_results values ('authenticated role without bypass',
    current_user = 'authenticated' and not exists (
      select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)));
  insert into rls_test_results values ('owner drawing visible',
    exists (select 1 from public.drawings where id = ctx.id));
  insert into rls_test_results values ('drawing CRUD grants present',
    has_table_privilege(current_user, 'public.drawings', 'SELECT')
    and has_table_privilege(current_user, 'public.drawings', 'INSERT')
    and has_table_privilege(current_user, 'public.drawings', 'UPDATE')
    and has_table_privilege(current_user, 'public.drawings', 'DELETE'));
  insert into rls_test_results values ('owner history visible',
    exists (select 1 from public.drawing_revisions where drawing_id = ctx.id));
  insert into rls_test_results values ('owner file metadata visible',
    exists (select 1 from public.drawing_files where drawing_id = ctx.id));
  insert into rls_test_results values ('owner referenced storage visible',
    exists (select 1 from storage.objects o join public.drawing_files f
      on o.name = f.storage_path where o.bucket_id = 'drawing-files' and f.drawing_id = ctx.id));

  perform set_config('request.jwt.claims',
    json_build_object('sub', ctx.foreign_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ctx.foreign_id::text, true);
  insert into rls_test_results values ('foreign drawing hidden',
    not exists (select 1 from public.drawings where id = ctx.id));
  insert into rls_test_results values ('foreign file metadata hidden',
    not exists (select 1 from public.drawing_files where drawing_id = ctx.id));
  insert into rls_test_results values ('foreign history hidden',
    not exists (select 1 from public.drawing_revisions where drawing_id = ctx.id));
  insert into rls_test_results values ('foreign storage prefix hidden',
    not exists (select 1 from storage.objects where bucket_id = 'drawing-files'
      and name like ctx.owner_id::text || '/' || ctx.id::text || '/%'));

  -- Each mutation is rolled back even if a broken policy allows it.
  begin
    update public.drawings set title = title where id = ctx.id;
    get diagnostics affected = row_count;
    raise exception using errcode = 'ZX001', message = 'Rollback test update';
  exception when sqlstate 'ZX001' then null;
  end;
  insert into rls_test_results values ('foreign drawing update affects zero', affected = 0);

  begin
    delete from public.drawings where id = ctx.id;
    get diagnostics affected = row_count;
    raise exception using errcode = 'ZX001', message = 'Rollback test delete';
  exception when sqlstate 'ZX001' then null;
  end;
  insert into rls_test_results values ('foreign drawing delete affects zero', affected = 0);

  write_denied := false;
  begin
    insert into public.drawings (owner_id, title, scene_data)
      values (ctx.owner_id, 'TEST rollback-only RLS probe', ctx.scene_data);
    raise exception using errcode = 'ZX001', message = 'Rollback test insert';
  exception
    when insufficient_privilege then write_denied := true;
    when sqlstate 'ZX001' then null;
  end;
  insert into rls_test_results values ('foreign owner spoof insert denied', write_denied);
end $$;
reset role;
select check_name, passed from rls_test_results order by check_name;
rollback;
