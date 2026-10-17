import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
} from "@excalidraw/excalidraw";
import { randomId } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";
import {
  Scene,
  bindBindingElement,
  bindPointToSnapToElementOutline,
  getBoundTextElement,
  getCommonBounds,
  getSelectedElements,
  isArrowElement,
  isTextElement,
  isNonDeletedElement,
  newArrowElement,
  newElementWith,
} from "@excalidraw/element";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawElement,
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { canvasMatches, createDiagramElements } from "./editor";
import { parseAnchorContext, parseDiagramExtension } from "./schema";

import type { CanvasSnapshot } from "./editor";
import type { DiagramExtension } from "./schema";

const isNode = (
  element: ExcalidrawElement | undefined,
): element is NonDeleted<ExcalidrawFlowchartNodeElement> =>
  !!element &&
  !element.isDeleted &&
  ["rectangle", "diamond", "ellipse"].includes(element.type);
export const selectedStructureAnchor = (api: ExcalidrawImperativeAPI) => {
  const elements = api.getSceneElements();
  const selected = getSelectedElements(elements, api.getAppState());
  const ids = new Set(
    selected.map((element) => {
      if (isNode(element)) {
        return element.id;
      }
      if (isTextElement(element) && element.containerId) {
        return element.containerId;
      }
      throw new Error("Unsupported anchor selection");
    }),
  );
  if (ids.size !== 1) {
    throw new Error("Select one anchor");
  }
  const anchor = elements.find((element) => element.id === [...ids][0]);
  if (
    !isNode(anchor) ||
    anchor.locked ||
    anchor.frameId ||
    ![anchor.x, anchor.y, anchor.width, anchor.height, anchor.angle].every(
      Number.isFinite,
    ) ||
    anchor.width <= 0 ||
    anchor.height <= 0 ||
    anchor.width > 20000 ||
    anchor.height > 20000
  ) {
    throw new Error("Unsupported anchor");
  }
  const text = getBoundTextElement(
    anchor,
    new Map(elements.map((element) => [element.id, element])),
  );
  if (text && (text.isDeleted || text.containerId !== anchor.id)) {
    throw new Error("Invalid anchor label");
  }
  return {
    elementId: anchor.id,
    context: parseAnchorContext({
      id: "s1",
      label: text?.originalText.replace(/\r?\n/g, " ") ?? "",
      kind:
        anchor.type === "diamond"
          ? "decision"
          : anchor.type === "ellipse"
          ? "terminal"
          : "process",
    }),
  };
};
export type StructureAnchor = ReturnType<typeof selectedStructureAnchor>;
export const structureAnchorMatches = (
  api: ExcalidrawImperativeAPI,
  anchor: StructureAnchor,
) => {
  try {
    return (
      JSON.stringify(selectedStructureAnchor(api)) === JSON.stringify(anchor)
    );
  } catch {
    return false;
  }
};
export type StructurePreview = {
  elements: readonly ExcalidrawElement[];
  addedIds: string[];
  image: Blob;
  anchor: StructureAnchor;
  title: string;
};

export const createStructurePreview = async (
  api: ExcalidrawImperativeAPI,
  value: DiagramExtension,
  anchor: StructureAnchor,
): Promise<StructurePreview> => {
  const plan = parseDiagramExtension(value);
  if (!structureAnchorMatches(api, anchor)) {
    throw new Error("Anchor changed");
  }
  const existing = api.getSceneElementsIncludingDeleted();
  const baseline = api.getSceneElements();
  const source = baseline.find((element) => element.id === anchor.elementId)!;
  const prefix = `a${randomId()
    .replace(/[^A-Za-z0-9]/g, "_")
    .slice(0, 20)}_`;
  const newNodes = await createDiagramElements(
    {
      ...plan,
      nodes: plan.nodes.map((node) => ({ ...node, id: prefix + node.id })),
      edges: [],
    },
    false,
  );
  const [minX, minY] = getCommonBounds(newNodes);
  const right = getCommonBounds(baseline)[2] + 180;
  if (![minX, minY, right].every(Number.isFinite)) {
    throw new Error("Invalid canvas bounds");
  }
  const moved = newNodes.map((element) =>
    newElementWith(element, {
      x: element.x + right - minX,
      y: element.y + source.y - minY,
    }),
  );
  const ids = new Set(existing.map((element) => element.id));
  if (moved.some((element) => ids.has(element.id))) {
    throw new Error("Element collision");
  }
  // Binding helpers mutate only this isolated scene, never the live canvas.
  const scene = new Scene(structuredClone(existing));
  try {
    scene.insertElementsAtIndex(moved, null);
    const aliases = new Map([
      ["s1", anchor.elementId],
      ...plan.nodes.map(
        (node) => [node.id, `node_${prefix}${node.id}`] as [string, string],
      ),
    ]);
    const addedIds = moved.map((element) => element.id);
    for (const edge of plan.edges) {
      const from = scene
        .getNonDeletedElementsMap()
        .get(aliases.get(edge.from)!);
      const to = scene.getNonDeletedElementsMap().get(aliases.get(edge.to)!);
      if (!isNode(from) || !isNode(to)) {
        throw new Error("Missing extension node");
      }
      const x = from.x + from.width / 2;
      const y = from.y + from.height / 2;
      const dx = to.x + to.width / 2 - x;
      const dy = to.y + to.height / 2 - y;
      const probe = newArrowElement({
        type: "arrow",
        x,
        y,
        width: Math.abs(dx),
        height: Math.abs(dy),
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(dx, dy)],
        endArrowhead: "arrow",
      });
      const start = bindPointToSnapToElementOutline(
        probe,
        from,
        "start",
        scene.getNonDeletedElementsMap(),
      );
      const end = bindPointToSnapToElementOutline(
        probe,
        to,
        "end",
        scene.getNonDeletedElementsMap(),
      );
      if (![...start, ...end].every(Number.isFinite)) {
        throw new Error("Invalid extension endpoints");
      }
      const edgeElements = convertToExcalidrawElements([
        {
          type: "arrow",
          x: start[0],
          y: start[1],
          points: [
            pointFrom<LocalPoint>(0, 0),
            pointFrom<LocalPoint>(end[0] - start[0], end[1] - start[1]),
          ],
          ...(edge.label ? { label: { text: edge.label } } : {}),
        },
      ]);
      if (
        edgeElements.some((element) =>
          scene.getElementsMapIncludingDeleted().has(element.id),
        )
      ) {
        throw new Error("Arrow collision");
      }
      scene.insertElementsAtIndex(edgeElements, null);
      const arrow = edgeElements.find(isArrowElement)!;
      bindBindingElement(arrow, from, "orbit", "start", scene);
      bindBindingElement(arrow, to, "orbit", "end", scene);
      addedIds.push(...edgeElements.map((element) => element.id));
    }
    const originals = new Map(existing.map((element) => [element.id, element]));
    const elements = scene
      .getElementsIncludingDeleted()
      .map((element) =>
        element.id === anchor.elementId
          ? element
          : originals.get(element.id) ?? element,
      );
    const added = new Set(addedIds);
    const visible = elements
      .filter(isNonDeletedElement)
      .filter(
        (element) =>
          !element.isDeleted &&
          (added.has(element.id) ||
            element.id === anchor.elementId ||
            (isTextElement(element) &&
              element.containerId === anchor.elementId)),
      );
    const [left, top, farRight, bottom] = getCommonBounds(visible);
    if (
      ![left, top, farRight, bottom].every(Number.isFinite) ||
      farRight - left > 40000 ||
      bottom - top > 40000
    ) {
      throw new Error("Extension is too large");
    }
    const image = await exportToBlob({
      elements: visible,
      files: {},
      mimeType: "image/png",
      maxWidthOrHeight: 1600,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    });
    return { elements, addedIds, image, anchor, title: plan.title };
  } finally {
    scene.destroy();
  }
};

export const applyStructurePreview = async (
  api: ExcalidrawImperativeAPI,
  preview: StructurePreview,
  baseline: CanvasSnapshot,
  current: () => boolean,
  backup: () => Promise<void>,
) => {
  const check = () => {
    if (
      !current() ||
      api.getAppState().viewModeEnabled ||
      !canvasMatches(api, baseline) ||
      !structureAnchorMatches(api, preview.anchor)
    ) {
      throw new Error("Canvas or anchor changed");
    }
  };
  check();
  await backup();
  check();
  api.updateScene({
    elements: preview.elements,
    appState: {
      selectedElementIds: Object.fromEntries(
        preview.addedIds.map((id) => [id, true]),
      ),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setViewport({
    target: getCommonBounds(
      preview.elements.filter(
        (element) =>
          preview.addedIds.includes(element.id) ||
          element.id === preview.anchor.elementId,
      ),
    ),
    fit: "scale-down",
    offsets: { ui: true },
  });
};
