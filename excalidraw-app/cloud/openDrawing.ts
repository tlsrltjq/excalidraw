/**
 * Personal Excalidraw Cloud — shared "load a Cloud drawing into the editor"
 * logic (Milestone 4 scene restore, Milestone 5 adds downloading the
 * drawing's images). Used by the Dashboard (open / create / save-current)
 * and by the save-status conflict UI (원격 새로고침).
 */
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { isInitializedImageElement } from "@excalidraw/element";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { appJotaiStore } from "../app-jotai";

import {
  flushAutosave,
  getCurrentFileManager,
  localDraftPromptAtom,
  pauseAutosave,
  primeAutosaveBaseline,
  resumeAutosave,
} from "./autosave";
import { getCurrentDrawing, setCurrentDrawing } from "./currentDrawing";
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
  void loadDrawingImages(excalidrawAPI, drawing.id, restoredElements);
};

/**
 * Downloads whatever images `elements` reference (via the file manager
 * `primeAutosaveBaseline` just created for this drawing) and adds them to
 * the editor. Runs after the scene is already on screen — elements render
 * with their "pending" placeholder until this resolves, same as the
 * existing local-first image loading path.
 */
const loadDrawingImages = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  drawingId: string,
  elements: readonly ExcalidrawElement[],
) => {
  const fileIds = elements.reduce<FileId[]>((acc, element) => {
    if (isInitializedImageElement(element)) {
      acc.push(element.fileId);
    }
    return acc;
  }, []);

  if (!fileIds.length) {
    return;
  }

  const fileManager = getCurrentFileManager();
  // the user may have already switched drawings by the time this resolves
  // (guardrail #5) — bail rather than add stale images to whatever's open now.
  if (!fileManager || getCurrentDrawing().drawingId !== drawingId) {
    return;
  }

  const { loadedFiles } = await fileManager.getFiles(fileIds);
  if (loadedFiles.length && getCurrentDrawing().drawingId === drawingId) {
    excalidrawAPI.addFiles(loadedFiles);
  }
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
