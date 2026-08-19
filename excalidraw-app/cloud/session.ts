/**
 * Personal Excalidraw Cloud — auth session state.
 *
 * Anonymous local-first editing must keep working with no session at all
 * (DECISIONS.md D-004). Login is only a precondition for the Cloud
 * Workspace (Milestone 3+), not for the app itself.
 */
import { useEffect } from "react";

import { atom, useAtomValue, appJotaiStore } from "../app-jotai";

import { supabase, isCloudConfigured } from "./supabaseClient";

import type { Session } from "@supabase/supabase-js";

export type CloudSessionState = {
  /** `null` while the initial session restore hasn't resolved yet. */
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

/**
 * Restores the existing session (if any) and subscribes to auth changes.
 * Safe to call from multiple components / to re-run under React Strict
 * Mode: the supabase-js auth listener is idempotent per-subscription and we
 * always unsubscribe on cleanup (ENGINEERING_GUARDRAILS.md #10).
 */
export const useCloudSession = (): CloudSessionState => {
  useEffect(() => {
    if (!supabase) {
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) {
        return;
      }
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[personal-cloud] failed to restore session", error);
      }
      appJotaiStore.set(cloudSessionAtom, {
        status: data.session ? "signed-in" : "signed-out",
        session: data.session ?? null,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) {
        return;
      }
      appJotaiStore.set(cloudSessionAtom, {
        status: session ? "signed-in" : "signed-out",
        session,
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return useAtomValue(cloudSessionAtom);
};

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
  await supabase.auth.signOut();
};
