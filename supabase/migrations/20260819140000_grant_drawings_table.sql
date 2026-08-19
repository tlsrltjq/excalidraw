-- Milestone 3 fix: explicit GRANTs for public.drawings
--
-- This Supabase project was created with "Automatically expose new tables"
-- disabled (intentionally — see DECISIONS.md and Supabase's own guidance to
-- control access manually). That means a new table gets RLS but NOT the
-- baseline Postgres privileges Supabase's Data API roles need to touch the
-- table at all: every request fails with "permission denied for table
-- drawings" before RLS is even evaluated.
--
-- RLS policies (drawings_select_own, drawings_insert_own, etc., from
-- 20260819130357_create_drawings_table.sql) still do the actual per-row
-- access control — these GRANTs only let the `authenticated` role onto the
-- table in the first place. `anon` is intentionally NOT granted access:
-- Cloud Workspace is signed-in-only by design.

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.drawings to authenticated;
