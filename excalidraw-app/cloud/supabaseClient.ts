/**
 * Personal Excalidraw Cloud — Supabase client.
 *
 * See personal-cloud-docs/ARCHITECTURE.md section 4 for where this module
 * sits relative to `excalidraw-app` and `packages/excalidraw`.
 *
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are optional on
 * purpose (DECISIONS.md D-004): the app must keep working as an anonymous,
 * local-first editor when Cloud isn't configured (e.g. a fresh clone before
 * `.env.local` is set up, or a PR preview build). Every Cloud module must
 * treat `supabase` as possibly `null` and fail soft, never throw, so the
 * rest of the app (editor, export, local save) is unaffected.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isCloudConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * `null` when Cloud env vars aren't set. Always check `isCloudConfigured` (or
 * null-check this value) before using it — do not assume Cloud is available.
 */
export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (!isCloudConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    "[personal-cloud] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — " +
      "Cloud auth is disabled, running in anonymous local-first mode.",
  );
}
