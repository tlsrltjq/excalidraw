begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('collab-files', 'collab-files', false, 4194304, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 4194304,
  allowed_mime_types = array['application/octet-stream'];

-- Restrictive policy also blocks access if a future broad permissive policy is added.
-- Only the proof-verifying Edge Function uses privileged Storage credentials.
create policy collab_files_proxy_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'collab-files')
  with check (bucket_id <> 'collab-files');
commit;
