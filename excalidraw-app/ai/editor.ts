import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
} from "@excalidraw/excalidraw";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { getCommonBounds } from "@excalidraw/element/bounds";
import { newElementWith } from "@excalidraw/element";
import { createStore, get, set } from "idb-keyval";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { diagramToMermaid } from "./schema";

import type { Diagram } from "./schema";

const store = () => createStore("personal-ai-recovery", "snapshots");
export const captureCanvas = (api: ExcalidrawImperativeAPI) => {
  const files = structuredClone(api.getFiles());
  return {
    scene: serializeAsJSON(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      files,
      "database",
    ),
    files,
    filesJSON: JSON.stringify(files),
  };
};
export type CanvasSnapshot = ReturnType<typeof captureCanvas>;
export const canvasMatches = (
  api: ExcalidrawImperativeAPI,
  snapshot: CanvasSnapshot,
) => {
  const current = captureCanvas(api);
  return (
    current.scene === snapshot.scene && current.filesJSON === snapshot.filesJSON
  );
};

export const createDiagramElements = async (
  diagram: Diagram,
  regenerateIds = true,
) => {
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const result = await parseMermaidToExcalidraw(diagramToMermaid(diagram));
  if (result.files && Object.keys(result.files).length) {
    throw new Error("Unsupported diagram files");
  }
  const elements = convertToExcalidrawElements(result.elements, {
    regenerateIds,
  });
  if (
    !elements.length ||
    elements.length > 180 ||
    elements.some(
      (el) =>
        !["rectangle", "diamond", "ellipse", "text", "arrow"].includes(
          el.type,
        ) ||
        el.link ||
        ![el.x, el.y, el.width, el.height].every(Number.isFinite) ||
        Math.max(Math.abs(el.x), Math.abs(el.y), el.width, el.height) > 20000,
    )
  ) {
    throw new Error("Unsupported diagram output");
  }
  return elements;
};

export const createDiagramPreview = async (diagram: Diagram) => {
  const elements = await createDiagramElements(diagram);
  const image = await exportToBlob({
    elements,
    files: {},
    mimeType: "image/png",
    maxWidthOrHeight: 1600,
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
  });
  return { elements, image };
};

type Backup = { scene: string; files: BinaryFiles; createdAt: number };
export const saveAIBackup = async (key: string, snapshot: CanvasSnapshot) => {
  if (new Blob([snapshot.scene, snapshot.filesJSON]).size > 32 * 1024 * 1024) {
    throw new Error("Backup too large");
  }
  const backup: Backup = {
    scene: snapshot.scene,
    files: snapshot.files,
    createdAt: Date.now(),
  };
  await set(key, backup, store());
};
export const loadAIBackup = async (key: string): Promise<string | null> => {
  const backup = await get<Backup>(key, store());
  if (!backup) {
    return null;
  }
  const parsed = JSON.parse(backup.scene);
  return serializeAsJSON(
    restoreElements(parsed.elements, null),
    restoreAppState(parsed.appState, null),
    backup.files,
    "local",
  );
};

export const appendAIDiagram = async (
  api: ExcalidrawImperativeAPI,
  generated: readonly ExcalidrawElement[],
  baseline: CanvasSnapshot,
  current: () => boolean,
  backup: () => Promise<void>,
) => {
  const check = () => {
    if (
      !current() ||
      api.getAppState().viewModeEnabled ||
      !canvasMatches(api, baseline)
    ) {
      throw new Error("Canvas changed");
    }
  };
  check();
  await backup();
  check();
  const existing = api.getSceneElementsIncludingDeleted();
  const visible = api.getSceneElements();
  const [minX, minY] = getCommonBounds(generated);
  const bounds = visible.length ? getCommonBounds(visible) : [0, 0, -120, 0];
  const added = generated.map((element) =>
    newElementWith(element, {
      x: element.x + bounds[2] + 120 - minX,
      y: element.y + bounds[1] - minY,
    }),
  );
  api.updateScene({
    elements: [...existing, ...added],
    appState: {
      selectedElementIds: Object.fromEntries(added.map((el) => [el.id, true])),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setViewport({
    target: getCommonBounds(added),
    fit: "scale-down",
    offsets: { ui: true },
  });
};
