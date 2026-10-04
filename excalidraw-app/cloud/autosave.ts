/**
 * Personal Excalidraw Cloud — autosave coordinator (Milestone 4 scene
 * autosave, Milestone 5 adds the per-drawing file upload after each
 * successful scene save).
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
import { debounce, randomId } from "@excalidraw/common";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { isInitializedImageElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { atom, appJotaiStore } from "../app-jotai";
import { Locker } from "../data/Locker";

import { getCurrentDrawing } from "./currentDrawing";
import { updateDrawingScene } from "./drawings";
import { createCloudFileManager } from "./fileAdapter";
import { clearLocalDraft, saveLocalDraft } from "./localDraftStore";
import { isCloudConfigured } from "./supabaseClient";

import type { FileManager } from "../data/FileManager";

import type { CloudAppState } from "./types";

export type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "uploading" }
  | { status: "file-error"; message: string }
  | { status: "saved"; at: number }
  | { status: "offline" }
  | { status: "error"; message: string }
  | { status: "conflict" };

export const saveStatusAtom = atom<SaveStatus>({ status: "idle" });
export const localDraftErrorAtom = atom<string | null>(null);

export type LocalDraftPrompt = {
  drawingId: string;
  elements: readonly ExcalidrawElement[];
  appState: CloudAppState;
  files?: BinaryFiles;
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
  token: string;
  draftPending: boolean;
  draftWrite?: Promise<void>;
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

/**
 * One `FileManager` per open drawing (see `fileAdapter.ts` for why it's
 * not a shared singleton), (re)created in `primeAutosaveBaseline`.
 */
let currentFileManager: FileManager | null = null;
export const getCurrentFileManager = () => currentFileManager;

type LockReason = "loading";
const locker = new Locker<LockReason>();
let loadingLocks = 0;
const drawingLoads = new Set<number>();

/** Held while a remote scene is being restored into the editor so the
 * resulting `onChange` doesn't get treated as a user edit. */
export const pauseAutosave = () => {
  loadingLocks += 1;
  locker.lock("loading");
};
export const resumeAutosave = () => {
  loadingLocks = Math.max(0, loadingLocks - 1);
  if (!loadingLocks) {
    locker.unlock("loading");
  }
};
export const pauseDrawingLoad = (generation: number) => {
  drawingLoads.add(generation);
  return () => drawingLoads.delete(generation);
};
export const isAutosavePaused = () =>
  locker.isLocked() || drawingLoads.has(getCurrentDrawing().generation);

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
  currentFileManager = createCloudFileManager(drawingId);
  appJotaiStore.set(saveStatusAtom, { status: "idle" });
  appJotaiStore.set(localDraftErrorAtom, null);
};

/** Call when leaving Cloud editing entirely (back to Dashboard, logout). */
export const clearAutosaveBaseline = () => {
  baseline = { drawingId: null, revision: null, serialized: null };
  latestSnapshot = null;
  currentFileManager = null;
  appJotaiStore.set(saveStatusAtom, { status: "idle" });
  appJotaiStore.set(localDraftErrorAtom, null);
};

export const shouldPreventCloudUnload = () =>
  !!getCurrentDrawing().drawingId &&
  (isAutosavePaused() ||
    inFlight ||
    !!latestSnapshot?.draftPending ||
    !!appJotaiStore.get(localDraftErrorAtom));

const reportDraftError = (drawingId: string, generation: number) => {
  const current = getCurrentDrawing();
  if (current.drawingId === drawingId && current.generation === generation) {
    appJotaiStore.set(
      localDraftErrorAtom,
      "로컬 복구 저장에 실패했습니다. 저장 공간을 확인하고 파일로 내보내세요.",
    );
  }
};

const clearSavedDraft = async (
  drawingId: string,
  generation: number,
  snapshot: Snapshot,
) => {
  await snapshot.draftWrite;
  try {
    await clearLocalDraft(drawingId, snapshot.token);
  } catch {
    reportDraftError(drawingId, generation);
  }
};

const performSave = async () => {
  const { drawingId } = getCurrentDrawing();
  if (
    isAutosavePaused() ||
    !drawingId ||
    appJotaiStore.get(localDraftPromptAtom)?.drawingId === drawingId ||
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

  const snapshot = latestSnapshot;
  const { elements, appState, files } = snapshot;
  const serialized = serializeAsJSON(elements, appState, files, "database");
  const fileManager = currentFileManager;
  const activeElements = elements.filter((element) => !element.isDeleted);
  const missingFiles = activeElements.some(
    (element) => isInitializedImageElement(element) && !files[element.fileId],
  );
  const pendingFiles = activeElements.some(
    (element) =>
      isInitializedImageElement(element) &&
      files[element.fileId] &&
      !fileManager?.isFileSavedOrBeingSaved(files[element.fileId]),
  );

  if (serialized === baseline.serialized && !pendingFiles && !missingFiles) {
    debouncedLocalDraftSave.flush();
    void clearSavedDraft(drawingId, getCurrentDrawing().generation, snapshot);
    if (appJotaiStore.get(saveStatusAtom).status === "saving") {
      appJotaiStore.set(saveStatusAtom, { status: "saved", at: Date.now() });
    }
    return;
  }

  inFlight = true;
  appJotaiStore.set(saveStatusAtom, { status: "saving" });

  const expectedRevision = baseline.revision;
  const generationAtStart = getCurrentDrawing().generation;
  const isCurrent = () => {
    const current = getCurrentDrawing();
    return (
      current.drawingId === drawingId &&
      current.generation === generationAtStart
    );
  };
  let uploading = false;

  try {
    debouncedLocalDraftSave.flush();
    await snapshot.draftWrite;
    if (!isCurrent()) {
      return;
    }
    if (serialized !== baseline.serialized) {
      const result = await updateDrawingScene(
        drawingId,
        JSON.parse(serialized),
        expectedRevision,
      );
      if (!isCurrent()) {
        return;
      }
      if (result.status === "conflict") {
        retryQueued = false;
        appJotaiStore.set(saveStatusAtom, { status: "conflict" });
        return;
      }
      baseline = { drawingId, revision: result.revision, serialized };
    }
    if (pendingFiles && fileManager) {
      uploading = true;
      appJotaiStore.set(saveStatusAtom, { status: "uploading" });
      const result = await fileManager.saveFiles({
        elements: activeElements,
        files,
      });
      if (!isCurrent()) {
        return;
      }
      if (result.erroredFiles.size) {
        throw new Error(
          "일부 이미지를 업로드하지 못했습니다. 다시 시도하세요.",
        );
      }
    }
    if (missingFiles) {
      uploading = true;
      throw new Error("이미지 데이터가 없어 저장 완료를 확인할 수 없습니다.");
    }
    if (!isCurrent()) {
      return;
    }
    if (latestSnapshot !== snapshot) {
      // A later edit must be saved before its recovery draft is discarded.
      retryQueued = true;
      appJotaiStore.set(saveStatusAtom, { status: "saving" });
      return;
    }
    debouncedLocalDraftSave.flush();
    await clearSavedDraft(drawingId, generationAtStart, snapshot);
    if (isCurrent() && latestSnapshot === snapshot) {
      appJotaiStore.set(saveStatusAtom, { status: "saved", at: Date.now() });
    } else if (isCurrent()) {
      retryQueued = true;
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
          status: uploading ? "file-error" : "error",
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
  (drawingId: string, generation: number, snapshot: Snapshot) => {
    snapshot.draftWrite = saveLocalDraft(
      drawingId,
      snapshot.elements,
      snapshot.appState,
      snapshot.files,
      snapshot.token,
    )
      .then(() => {
        const current = getCurrentDrawing();
        if (
          current.drawingId === drawingId &&
          current.generation === generation
        ) {
          appJotaiStore.set(localDraftErrorAtom, null);
        }
      })
      .catch(() => reportDraftError(drawingId, generation))
      .finally(() => {
        snapshot.draftPending = false;
      });
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
  const { drawingId, generation } = getCurrentDrawing();
  if (
    !drawingId ||
    appJotaiStore.get(localDraftPromptAtom)?.drawingId === drawingId
  ) {
    return;
  }

  latestSnapshot = {
    elements,
    appState,
    files,
    token: randomId(),
    draftPending: true,
  };
  debouncedLocalDraftSave(drawingId, generation, latestSnapshot);
  debouncedCloudSave();
};

/** Forces any pending debounced saves to run immediately. Call on blur,
 * document hide, drawing switch, and logout. */
export const flushAutosave = () => {
  debouncedLocalDraftSave.flush();
  debouncedCloudSave.flush();
};
