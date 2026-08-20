/**
 * Personal Excalidraw Cloud — shared "load a Cloud drawing into the editor"
 * logic (Milestone 4). Used by the Dashboard (open / create / save-current)
 * and by the save-status conflict UI (원격 새로고침).
 */
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { appJotaiStore } from "../app-jotai";

import {
  flushAutosave,
  localDraftPromptAtom,
  pauseAutosave,
  primeAutosaveBaseline,
  resumeAutosave,
} from "./autosave";
import { setCurrentDrawing } from "./currentDrawing";
import { getLocalDraft } from "./localDraftStore";
import { setDrawingIdInUrl } from "./urlDrawingId";

import type { CloudAppState, CloudDrawing } from "./types";

/**
 * Restores `drawing` into the editor, makes it the "current" Cloud
 * drawing, primes the autosave baseline, and (async, non-blocking) checks
 * for a local draft that might contain unsynced changes the server doesn't
 * have.
 */
export const openCloudDrawing = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  drawing: CloudDrawing,
) => {
  // guardrail #6/#8: never switch away from whatever was previously open
  // without giving its last pending edit a chance to reach the server.
  flushAutosave();
  pauseAutosave();

  const restoredElements = restoreElements(drawing.sceneData.elements, null, {
    repairBindings: true,
    deleteInvisibleElements: true,
  });
  const restoredAppState = restoreAppState(drawing.sceneData.appState, null);

  setCurrentDrawing(drawing.id);
  excalidrawAPI.updateScene({
    elements: restoredElements,
    appState: restoredAppState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  setDrawingIdInUrl(drawing.id);
  primeAutosaveBaseline(
    drawing.id,
    drawing.revision,
    restoredElements,
    restoredAppState,
    {},
  );

  // Release the lock on the next tick — by then, the `onChange` this
  // `updateScene` call may trigger will already have run. If it slips
  // through anyway, `performSave`'s baseline-equality check is the real
  // safety net (see autosave.ts), so this is defense-in-depth, not the
  // only guard.
  setTimeout(resumeAutosave, 0);

  void checkForNewerLocalDraft(drawing.id, restoredElements, restoredAppState);
};

/**
 * Makes `drawing` the "current" Cloud drawing WITHOUT touching the editor
 * — for when the editor's content already matches what was just saved
 * (creating a drawing from the current canvas, saving a copy, resolving a
 * conflict by overwriting). Skips the scene-restore/lock dance in
 * `openCloudDrawing` since there's nothing to restore.
 */
export const adoptCloudDrawing = (
  drawing: CloudDrawing,
  elements: readonly ExcalidrawElement[],
  appState: CloudAppState,
  files: BinaryFiles,
) => {
  flushAutosave();
  setCurrentDrawing(drawing.id);
  primeAutosaveBaseline(
    drawing.id,
    drawing.revision,
    elements,
    appState,
    files,
  );
  setDrawingIdInUrl(drawing.id);
};

const checkForNewerLocalDraft = async (
  drawingId: string,
  serverElements: Parameters<typeof restoreElements>[0],
  serverAppState: ReturnType<typeof restoreAppState>,
) => {
  const draft = await getLocalDraft(drawingId);
  if (!draft) {
    return;
  }
  // still looking at the same drawing?
  if (appJotaiStore.get(localDraftPromptAtom)?.drawingId === drawingId) {
    return;
  }

  const serverSerialized = serializeAsJSON(
    serverElements ?? [],
    serverAppState,
    {},
    "database",
  );
  const draftSerialized = serializeAsJSON(
    draft.elements,
    draft.appState,
    {},
    "database",
  );

  if (draftSerialized === serverSerialized) {
    return;
  }

  appJotaiStore.set(localDraftPromptAtom, {
    drawingId,
    elements: draft.elements,
    appState: draft.appState,
  });
};
