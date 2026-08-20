/**
 * Personal Excalidraw Cloud — auth session state.
 *
 * Anonymous local-first editing must keep working with no session at all
 * (DECISIONS.md D-004). Login is only a precondition for the Cloud
 * Workspace (Milestone 3+), not for the app itself.
 */
import { atom, useAtomValue, appJotaiStore } from "../app-jotai";

import { clearAutosaveBaseline, flushAutosave } from "./autosave";
import { getCurrentDrawing, setCurrentDrawing } from "./currentDrawing";
import { supabase, isCloudConfigured } from "./supabaseClient";
import { setDrawingIdInUrl } from "./urlDrawingId";

import type { Session } from "@supabase/supabase-js";

export type CloudSessionState = {
  /** `"loading"` while the initial session restore hasn't resolved yet. */
  status: "loading" | "signed-out" | "signed-in";
  session: Session | null;
};

const initialState: CloudSessionState = {
  // if Cloud isn't configured there's nothing to restore — go straight to
  // signed-out so UI doesn't get stuck showing a loading state forever.
  status: isCloudConfigured ? "loading" : "signed-out",
  session: null,
};

export const cloudSessionAtom = atom<CloudSessionState>(initialState);

// Set up the session restore + auth-change subscription exactly once, at
// module scope — `supabase` is already a module-level singleton, so every
// consumer of `useCloudSession()` shares this one subscription instead of
// each mounting its own (ENGINEERING_GUARDRAILS.md #10: don't duplicate
// listeners/requests that hot paths or multiple components would otherwise
// each re-create). ES modules only evaluate their top level once per
// resolved module, so this isn't affected by React Strict Mode's
// double-invocation of render/effects.
if (supabase) {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[personal-cloud] failed to restore session", error);
    }
    appJotaiStore.set(cloudSessionAtom, {
      status: data.session ? "signed-in" : "signed-out",
      session: data.session ?? null,
    });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    appJotaiStore.set(cloudSessionAtom, {
      status: session ? "signed-in" : "signed-out",
      session,
    });

    // signed out while a Cloud drawing was open: nothing more can be saved
    // (RLS would reject it anyway once the JWT is gone), so drop back to
    // anonymous local-first state cleanly instead of leaving stale
    // drawing/save-status UI around.
    if (!session && getCurrentDrawing().drawingId) {
      clearAutosaveBaseline();
      setCurrentDrawing(null);
      setDrawingIdInUrl(null, { replace: true });
    }
  });
}

export const useCloudSession = (): CloudSessionState =>
  useAtomValue(cloudSessionAtom);

export const signInWithGoogle = async () => {
  if (!supabase) {
    return;
  }
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // send the user back to wherever they started the login from
      // (dev / preview / production origin), not a hardcoded URL.
      redirectTo: window.location.origin,
    },
  });
};

export const signOut = async () => {
  if (!supabase) {
    return;
  }
  // best-effort: give any pending edit a chance to reach the server before
  // the session (and the JWT that autosave needs) goes away.
  flushAutosave();
  await supabase.auth.signOut();
};
