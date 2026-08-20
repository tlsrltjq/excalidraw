/**
 * Personal Excalidraw Cloud — per-drawing local draft store (Milestone 4).
 *
 * Separate from the existing anonymous local-first storage
 * (`excalidraw-app/data/LocalData.ts`, one global localStorage scene) and
 * separate from the server's copy — this is the "current unsynced local
 * draft" bucket, keyed by `drawingId`, per ENGINEERING_GUARDRAILS.md #8:
 * "서버 scene, 마지막 동기화 scene, 현재 local draft를 구분한다."
 *
 * Only cleared after a confirmed successful Cloud save (or when the user
 * explicitly discards it) — never on failure, offline, or navigation, so a
 * crashed tab / failed save never silently loses work.
 */
import { createStore, get, set, del } from "idb-keyval";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { CloudAppState } from "./types";

const draftsStore = createStore("personal-cloud-drafts-db", "drafts-store");

export type LocalDraft = {
  elements: readonly ExcalidrawElement[];
  appState: CloudAppState;
  savedAt: number;
};

export const saveLocalDraft = (
  drawingId: string,
  elements: readonly ExcalidrawElement[],
  appState: CloudAppState,
): Promise<void> =>
  set(drawingId, { elements, appState, savedAt: Date.now() }, draftsStore);

export const getLocalDraft = (
  drawingId: string,
): Promise<LocalDraft | undefined> => get(drawingId, draftsStore);

export const clearLocalDraft = (drawingId: string): Promise<void> =>
  del(drawingId, draftsStore);
