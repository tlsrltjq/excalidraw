-- Read-only operational audit. Returns metadata, never user scenes or secrets.
with audit as (
  select 'table_rls' as area,
    n.nspname || '.' || c.relname as object_name,
    jsonb_build_object(
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity
    ) as details
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' and c.relname in (
    'drawings', 'drawing_files', 'drawing_revisions'
  )) or (n.nspname = 'storage' and c.relname = 'objects')

  union all
  select 'policy', schemaname || '.' || tablename || ':' || policyname,
    jsonb_build_object(
      'command', cmd,
      'roles', roles,
      'permissive', permissive,
      'using', qual,
      'with_check', with_check
    )
  from pg_policies
  where (schemaname = 'public' and tablename in (
    'drawings', 'drawing_files', 'drawing_revisions'
  )) or (schemaname = 'storage' and tablename = 'objects')

  union all
  select 'table_privileges', r.rolname || ':' || n.nspname || '.' || c.relname,
    jsonb_build_object(
      'select', has_table_privilege(r.oid, c.oid, 'SELECT'),
      'insert', has_table_privilege(r.oid, c.oid, 'INSERT'),
      'update', has_table_privilege(r.oid, c.oid, 'UPDATE'),
      'delete', has_table_privilege(r.oid, c.oid, 'DELETE')
    )
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join pg_roles r
  where n.nspname = 'public'
    and c.relname in ('drawings', 'drawing_files', 'drawing_revisions')
    and r.rolname in ('anon', 'authenticated')

  union all
  select 'bucket', id, jsonb_build_object('public', public)
  from storage.buckets
  where id = 'drawing-files'

  union all
  select 'trigger', 'public.drawings:' || t.tgname,
    jsonb_build_object(
      'enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid),
      'security_definer', p.prosecdef,
      'function_settings', p.proconfig
    )
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = to_regclass('public.drawings') and not t.tgisinternal
)
select area, object_name, details
from audit
order by area, object_name;
