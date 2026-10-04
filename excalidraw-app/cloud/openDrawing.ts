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
  localDraftErrorAtom,
  pauseDrawingLoad,
  primeAutosaveBaseline,
  scheduleAutosave,
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

  const restoredElements = restoreElements(drawing.sceneData.elements, null, {
    repairBindings: true,
    deleteInvisibleElements: true,
  });
  const restoredAppState = restoreAppState(drawing.sceneData.appState, null);

  const generation = setCurrentDrawing(drawing.id);
  const releaseLoad = pauseDrawingLoad(generation);
  try {
    appJotaiStore.set(localDraftPromptAtom, null);
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

    return initializeDrawingRecovery(
      excalidrawAPI,
      drawing.id,
      generation,
      restoredElements,
      restoredAppState,
      releaseLoad,
    );
  } catch (error) {
    releaseLoad();
    throw error;
  }
};

/**
 * Downloads whatever images `elements` reference (via the file manager
 * `primeAutosaveBaseline` just created for this drawing) and adds them to
 * the editor. Runs after the scene is already on screen — elements render
 * with their "pending" placeholder until this resolves, same as the
 * existing local-first image loading path.
 */
const initializeDrawingRecovery = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  drawingId: string,
  generation: number,
  elements: readonly ExcalidrawElement[],
  appState: CloudAppState,
  releaseLoad: () => unknown,
) => {
  const fileIds = elements.reduce<FileId[]>((acc, element) => {
    if (isInitializedImageElement(element)) {
      acc.push(element.fileId);
    }
    return acc;
  }, []);

  const fileManager = getCurrentFileManager();
  const isCurrent = () => {
    const current = getCurrentDrawing();
    return current.drawingId === drawingId && current.generation === generation;
  };
  let initialized = false;
  try {
    const draft = await getLocalDraft(drawingId);
    if (!isCurrent()) {
      return;
    }
    const { loadedFiles } =
      fileIds.length && fileManager
        ? await fileManager.getFiles(fileIds)
        : { loadedFiles: [] };
    if (!isCurrent()) {
      return;
    }
    if (loadedFiles.length) {
      excalidrawAPI.addFiles(loadedFiles);
    }
    if (draft) {
      const draftElements = restoreElements(draft.elements, null, {
        repairBindings: true,
        deleteInvisibleElements: true,
      });
      const draftAppState = restoreAppState(draft.appState, null);
      const serverSerialized = serializeAsJSON(
        elements,
        appState,
        {},
        "database",
      );
      const draftSerialized = serializeAsJSON(
        draftElements,
        draftAppState,
        {},
        "database",
      );
      const localFiles = draft.files ?? {};
      const unsyncedImage = draftElements.some((element) => {
        if (
          !isInitializedImageElement(element) ||
          !localFiles[element.fileId]
        ) {
          return false;
        }
        const remote = loadedFiles.find((file) => file.id === element.fileId);
        return !remote || remote.dataURL !== localFiles[element.fileId].dataURL;
      });
      if (draftSerialized !== serverSerialized || unsyncedImage) {
        appJotaiStore.set(localDraftPromptAtom, {
          drawingId,
          elements: draftElements,
          appState: draftAppState,
          files: localFiles,
        });
      }
    }
    initialized = true;
  } catch {
    if (isCurrent()) {
      appJotaiStore.set(
        localDraftErrorAtom,
        "로컬 초안 또는 이미지를 읽지 못했습니다. 파일 백업을 확인하세요.",
      );
    }
  } finally {
    releaseLoad();
    if (
      initialized &&
      isCurrent() &&
      !appJotaiStore.get(localDraftPromptAtom)
    ) {
      scheduleAutosave(
        excalidrawAPI.getSceneElements(),
        excalidrawAPI.getAppState(),
        excalidrawAPI.getFiles(),
      );
    }
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
  scheduleAutosave(elements, appState, files);
  flushAutosave();
};
