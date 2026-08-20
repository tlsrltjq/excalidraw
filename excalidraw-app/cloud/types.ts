import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";

/**
 * Shape stored in `drawings.scene_data`. This is exactly what
 * `JSON.parse(serializeAsJSON(elements, appState, files, "database"))`
 * produces — never a hand-rolled schema (AGENTS.md "Excalidraw 데이터 규칙").
 */
export type CloudSceneData = ImportedDataState;

/**
 * The app state shape shared by `restoreAppState()`'s return value and
 * `excalidrawAPI.getAppState()` (which is a strict superset — it also has
 * layout fields like `width`/`height` that restored state doesn't). Using
 * this everywhere in `cloud/*` instead of `AppState` or `Partial<AppState>`
 * is what keeps `excalidrawAPI.updateScene()`'s generic
 * `Pick<AppState, K>` type inference happy — `Partial<AppState>` breaks it
 * (every field becomes `T | undefined`, which doesn't match AppState's own,
 * often non-optional, field types).
 */
export type CloudAppState = RestoredDataState["appState"];

export type CloudDrawingSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CloudDrawing = CloudDrawingSummary & {
  ownerId: string;
  sceneData: CloudSceneData;
  revision: number;
};
