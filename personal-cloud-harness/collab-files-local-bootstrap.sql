-- ONLY in a disposable local PostgreSQL container, not hosted Supabase.
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id), name text not null
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
-- Deliberately broad policy tests whether the restrictive migration still blocks access.
create policy local_test_broad_policy on storage.objects for all to anon, authenticated
  using (true) with check (true);
