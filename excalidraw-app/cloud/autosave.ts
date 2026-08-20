/**
 * Personal Excalidraw Cloud — autosave coordinator (Milestone 4).
 *
 * Called from `onChange` (a hot path — ENGINEERING_GUARDRAILS.md #4), so
 * this file never does network/serialize work synchronously on every call.
 * `scheduleAutosave` only records the latest snapshot and (re)arms two
 * debounced timers: a short one that persists a per-drawing local draft to
 * IndexedDB, and a longer one that actually talks to Supabase.
 *
 * Single-flight per drawing: if a save is in flight when the debounce fires
 * again, we don't start a second request — we just remember to retry with
 * whatever the latest snapshot is once the first one finishes (#5 "최신
 * 변경을 후속 저장으로 합치기").
 */
import { debounce } from "@excalidraw/common";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { atom, appJotaiStore } from "../app-jotai";
import { Locker } from "../data/Locker";

import { getCurrentDrawing } from "./currentDrawing";
import { updateDrawingScene } from "./drawings";
import { clearLocalDraft, saveLocalDraft } from "./localDraftStore";
import { isCloudConfigured } from "./supabaseClient";

import type { CloudAppState } from "./types";

export type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "offline" }
  | { status: "error"; message: string }
  | { status: "conflict" };

export const saveStatusAtom = atom<SaveStatus>({ status: "idle" });

export type LocalDraftPrompt = {
  drawingId: string;
  elements: readonly ExcalidrawElement[];
  appState: CloudAppState;
};

/**
 * Set by `openDrawing.ts` when a drawing is opened and IndexedDB has a
 * local draft for it that differs from what the server just returned —
 * e.g. a save failed, the tab crashed, or the user went offline mid-edit
 * (guardrail #8: never silently prefer one over the other). `null` when
 * there's nothing to ask about.
 */
export const localDraftPromptAtom = atom<LocalDraftPrompt | null>(null);

type Snapshot = {
  elements: readonly ExcalidrawElement[];
  appState: CloudAppState;
  files: BinaryFiles;
};

/**
 * What "already saved" means for the currently open drawing. `serialized`
 * is compared against on every save attempt so an autosave triggered by,
 * say, a remote-scene restore (which fires `onChange` but changed nothing
 * a user did) is a correct no-op even if a pause/resume lock timing is
 * imperfect — see `openDrawing.ts`.
 */
let baseline: {
  drawingId: string | null;
  revision: number | null;
  serialized: string | null;
} = { drawingId: null, revision: null, serialized: null };

let latestSnapshot: Snapshot | null = null;
let inFlight = false;
let retryQueued = false;

type LockReason = "loading";
const locker = new Locker<LockReason>();

/** Held while a remote scene is being restored into the editor so the
 * resulting `onChange` doesn't get treated as a user edit. */
export const pauseAutosave = () => locker.lock("loading");
export const resumeAutosave = () => locker.unlock("loading");
export const isAutosavePaused = () => locker.isLocked();

/**
 * Call right after a drawing is loaded, created, or saved, to establish
 * what "no changes yet" looks like for it.
 */
export const primeAutosaveBaseline = (
  drawingId: string,
  revision: number,
  elements: readonly ExcalidrawElement[],
  appState: CloudAppState,
  files: BinaryFiles,
) => {
  baseline = {
    drawingId,
    revision,
    serialized: serializeAsJSON(elements, appState, files, "database"),
  };
  latestSnapshot = null;
  appJotaiStore.set(saveStatusAtom, { status: "idle" });
};

/** Call when leaving Cloud editing entirely (back to Dashboard, logout). */
export const clearAutosaveBaseline = () => {
  baseline = { drawingId: null, revision: null, serialized: null };
  latestSnapshot = null;
  appJotaiStore.set(saveStatusAtom, { status: "idle" });
};

const performSave = async () => {
  const { drawingId } = getCurrentDrawing();
  if (
    !drawingId ||
    drawingId !== baseline.drawingId ||
    baseline.revision === null ||
    !latestSnapshot
  ) {
    // switched/closed the drawing, or nothing primed yet — drop this save.
    return;
  }

  if (inFlight) {
    retryQueued = true;
    return;
  }

  const { elements, appState, files } = latestSnapshot;
  const serialized = serializeAsJSON(elements, appState, files, "database");

  if (serialized === baseline.serialized) {
    // nothing actually changed since the last successful save.
    return;
  }

  inFlight = true;
  appJotaiStore.set(saveStatusAtom, { status: "saving" });

  const expectedRevision = baseline.revision;
  const generationAtStart = getCurrentDrawing().generation;

  try {
    const result = await updateDrawingScene(
      drawingId,
      JSON.parse(serialized),
      expectedRevision,
    );

    const current = getCurrentDrawing();
    if (
      current.drawingId !== drawingId ||
      current.generation !== generationAtStart
    ) {
      // user switched drawings while this save was in flight — the result
      // no longer applies to what's on screen.
      return;
    }

    if (result.status === "conflict") {
      // stop treating this as "saved" and let the UI offer resolution
      // (DECISIONS.md D-007). Don't touch baseline — we don't know which
      // side should win yet.
      appJotaiStore.set(saveStatusAtom, { status: "conflict" });
    } else {
      baseline = { drawingId, revision: result.revision, serialized };
      // only clear the offline/failure safety net after a *confirmed*
      // success (ENGINEERING_GUARDRAILS.md #8).
      void clearLocalDraft(drawingId);
      appJotaiStore.set(saveStatusAtom, { status: "saved", at: Date.now() });
    }
  } catch (e: any) {
    const current = getCurrentDrawing();
    if (
      current.drawingId === drawingId &&
      current.generation === generationAtStart
    ) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        appJotaiStore.set(saveStatusAtom, { status: "offline" });
      } else {
        appJotaiStore.set(saveStatusAtom, {
          status: "error",
          message: e?.message ?? String(e),
        });
      }
      // local draft stays (guardrail #8) — nothing to lose.
    }
  } finally {
    inFlight = false;
    if (retryQueued) {
      retryQueued = false;
      void performSave();
    }
  }
};

const debouncedLocalDraftSave = debounce(
  (
    drawingId: string,
    elements: readonly ExcalidrawElement[],
    appState: CloudAppState,
  ) => {
    void saveLocalDraft(drawingId, elements, appState);
  },
  300,
);

const debouncedCloudSave = debounce(() => {
  void performSave();
}, 2000);

/**
 * Call from `onChange`. No-ops unless Cloud is configured and a drawing is
 * currently open — anonymous local-first editing is completely unaffected
 * (DECISIONS.md D-004). Callers are expected to already have skipped this
 * while collaborating (DECISIONS.md D-008), matching how `LocalData.save`
 * is gated at the same call site in `App.tsx`.
 */
export const scheduleAutosave = (
  elements: readonly ExcalidrawElement[],
  appState: CloudAppState,
  files: BinaryFiles,
) => {
  if (!isCloudConfigured || isAutosavePaused()) {
    return;
  }
  const { drawingId } = getCurrentDrawing();
  if (!drawingId) {
    return;
  }

  latestSnapshot = { elements, appState, files };
  debouncedLocalDraftSave(drawingId, elements, appState);
  debouncedCloudSave();
};

/** Forces any pending debounced saves to run immediately. Call on blur,
 * document hide, drawing switch, and logout. */
export const flushAutosave = () => {
  debouncedLocalDraftSave.flush();
  debouncedCloudSave.flush();
};
