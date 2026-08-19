import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";

/**
 * Shape stored in `drawings.scene_data`. This is exactly what
 * `JSON.parse(serializeAsJSON(elements, appState, files, "database"))`
 * produces — never a hand-rolled schema (AGENTS.md "Excalidraw 데이터 규칙").
 */
export type CloudSceneData = ImportedDataState;

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
